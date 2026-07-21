"""Complete Active Recall and spaced-repetition study application.

This module initializes the local SQLite database, provides the base
Streamlit navigation, and supports adding, viewing, filtering, and deleting
questions, interactive review sessions, progress analytics, and data export.
"""

import sqlite3
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st


APP_DIRECTORY = Path(__file__).resolve().parent
DATABASE_PATH = APP_DIRECTORY / "study_tracker.db"
DEFAULT_COURSES = ("CSC3003S", "INF3012S", "AST1000S")
RATING_LEVELS = {
    1: ("Blackout", 0),
    2: ("Hard", 1),
    3: ("Good", 3),
    4: ("Great", 7),
    5: ("Flawless", 14),
}


def initialize_database() -> None:
    """Create the questions table when the application starts."""
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY,
                course TEXT,
                chapter TEXT,
                subchapter TEXT,
                question TEXT,
                answer TEXT,
                level INTEGER DEFAULT 1,
                last_reviewed DATE,
                next_review DATE,
                review_count INTEGER DEFAULT 0
            )
            """
        )
        connection.commit()


def add_question(
    course: str,
    chapter: str,
    subchapter: str,
    question: str,
    answer: str,
) -> None:
    """Insert a new question scheduled for review today."""
    today = date.today().isoformat()
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT INTO questions (
                course,
                chapter,
                subchapter,
                question,
                answer,
                level,
                last_reviewed,
                next_review,
                review_count
            )
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0)
            """,
            (
                course,
                chapter.strip(),
                subchapter.strip(),
                question.strip(),
                answer.strip(),
                today,
                today,
            ),
        )
        connection.commit()


def load_distinct_values(column: str, conditions: dict[str, str] | None = None) -> list[str]:
    """Return sorted, non-empty values for a safe, predefined column."""
    allowed_columns = {"course", "chapter", "subchapter"}
    if column not in allowed_columns:
        raise ValueError(f"Unsupported column: {column}")

    conditions = conditions or {}
    invalid_conditions = set(conditions) - allowed_columns
    if invalid_conditions:
        raise ValueError(f"Unsupported filters: {invalid_conditions}")

    clauses = [f"{name} = ?" for name in conditions]
    parameters = tuple(conditions.values())
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT DISTINCT {column}
        FROM questions
        {where_clause}
        AND {column} IS NOT NULL AND TRIM({column}) != ''
        ORDER BY {column}
    """ if where_clause else f"""
        SELECT DISTINCT {column}
        FROM questions
        WHERE {column} IS NOT NULL AND TRIM({column}) != ''
        ORDER BY {column}
    """

    with sqlite3.connect(DATABASE_PATH) as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [str(row[0]) for row in rows]


def load_questions(
    course: str | None = None,
    chapter: str | None = None,
    subchapter: str | None = None,
) -> pd.DataFrame:
    """Load questions using optional hierarchy filters."""
    filters = {
        "course": course,
        "chapter": chapter,
        "subchapter": subchapter,
    }
    active_filters = {name: value for name, value in filters.items() if value}
    clauses = [f"{name} = ?" for name in active_filters]
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            id,
            course,
            chapter,
            subchapter,
            question,
            answer,
            level,
            last_reviewed,
            next_review,
            review_count
        FROM questions
        {where_clause}
        ORDER BY course, chapter, subchapter, id
    """
    with sqlite3.connect(DATABASE_PATH) as connection:
        return pd.read_sql_query(query, connection, params=tuple(active_filters.values()))


def delete_question(question_id: int) -> bool:
    """Delete one question by ID and report whether a row was removed."""
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            "DELETE FROM questions WHERE id = ?",
            (question_id,),
        )
        connection.commit()
        return cursor.rowcount == 1


def load_due_questions(
    course: str | None = None,
    chapter: str | None = None,
    subchapter: str | None = None,
) -> pd.DataFrame:
    """Load questions due today or earlier using optional hierarchy filters."""
    filters = {
        "course": course,
        "chapter": chapter,
        "subchapter": subchapter,
    }
    active_filters = {name: value for name, value in filters.items() if value}
    clauses = ["DATE(next_review) <= DATE(?)"]
    parameters: list[str] = [date.today().isoformat()]

    for name, value in active_filters.items():
        clauses.append(f"{name} = ?")
        parameters.append(value)

    query = f"""
        SELECT
            id,
            course,
            chapter,
            subchapter,
            question,
            answer,
            level,
            last_reviewed,
            next_review,
            review_count
        FROM questions
        WHERE {' AND '.join(clauses)}
        ORDER BY DATE(next_review), level, id
    """
    with sqlite3.connect(DATABASE_PATH) as connection:
        return pd.read_sql_query(query, connection, params=tuple(parameters))


def rate_question(question_id: int, level: int) -> date:
    """Persist a review rating and return the newly scheduled review date."""
    if level not in RATING_LEVELS:
        raise ValueError("Review level must be between 1 and 5.")

    today = date.today()
    next_review = today + timedelta(days=RATING_LEVELS[level][1])
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            """
            UPDATE questions
            SET
                level = ?,
                last_reviewed = ?,
                next_review = ?,
                review_count = review_count + 1
            WHERE id = ?
            """,
            (
                level,
                today.isoformat(),
                next_review.isoformat(),
                question_id,
            ),
        )
        if cursor.rowcount != 1:
            raise ValueError(f"Question #{question_id} could not be found.")
        connection.commit()
    return next_review


def calculate_review_streak(review_dates: pd.Series) -> int:
    """Calculate the current daily streak from distinct review dates."""
    parsed_dates = pd.to_datetime(review_dates, errors="coerce").dropna()
    active_dates = {timestamp.date() for timestamp in parsed_dates}
    if not active_dates:
        return 0

    cursor = date.today()
    if cursor not in active_dates:
        cursor -= timedelta(days=1)

    streak = 0
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def build_analytics_data(questions: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build forgetting-status counts and hierarchy mastery summaries."""
    analytics = questions.copy()
    today = pd.Timestamp(date.today())
    analytics["next_review_date"] = pd.to_datetime(
        analytics["next_review"],
        errors="coerce",
    )

    overdue = analytics["next_review_date"].notna() & (
        analytics["next_review_date"] < today
    )
    at_risk = analytics["level"].isin([1, 2]) | overdue
    mastered = analytics["level"].isin([4, 5]) & ~at_risk

    analytics["memory_status"] = "Learning / Repetition"
    analytics.loc[mastered, "memory_status"] = "Mastered"
    analytics.loc[at_risk, "memory_status"] = "At Risk / Overdue"

    status_order = ["Mastered", "Learning / Repetition", "At Risk / Overdue"]
    status_counts = (
        analytics["memory_status"]
        .value_counts()
        .reindex(status_order, fill_value=0)
        .rename_axis("Status")
        .reset_index(name="Questions")
    )

    analytics["is_mastered"] = analytics["level"].isin([4, 5]).astype(int)
    breakdown = (
        analytics.groupby(
            ["course", "chapter", "subchapter"],
            dropna=False,
            as_index=False,
        )
        .agg(
            total_questions=("id", "count"),
            mastered_questions=("is_mastered", "sum"),
        )
    )
    breakdown["completion"] = (
        breakdown["mastered_questions"] / breakdown["total_questions"]
    )
    return status_counts, breakdown


def active_practice_page() -> None:
    """Display filters and the interactive active-recall flashcard queue."""
    st.title("Active Practice")
    st.caption("Answer from memory before revealing the solution, then rate your recall.")

    review_scope = st.segmented_control(
        "What would you like to review?",
        ("All Due Questions", "By Course", "By Chapter/Subchapter"),
        default="All Due Questions",
        key="practice_review_scope",
    )

    selected_course: str | None = None
    selected_chapter: str | None = None
    selected_subchapter: str | None = None

    if review_scope == "By Course":
        selected_course = st.selectbox(
            "Course",
            DEFAULT_COURSES,
            key="practice_course_filter",
        )
    elif review_scope == "By Chapter/Subchapter":
        selected_course = st.selectbox(
            "Course",
            DEFAULT_COURSES,
            key="practice_hierarchy_course",
        )
        chapter_options = load_distinct_values(
            "chapter",
            {"course": selected_course},
        )
        if not chapter_options:
            st.info("This course has no chapters yet. Add questions before starting a review.")
            return

        selected_chapter = st.selectbox(
            "Chapter",
            chapter_options,
            key="practice_chapter_filter",
        )
        subchapter_options = load_distinct_values(
            "subchapter",
            {"course": selected_course, "chapter": selected_chapter},
        )
        subchapter_choice = st.selectbox(
            "Subchapter",
            ["All subchapters", *subchapter_options],
            key="practice_subchapter_filter",
        )
        if subchapter_choice != "All subchapters":
            selected_subchapter = subchapter_choice

    filter_signature = (
        review_scope,
        selected_course,
        selected_chapter,
        selected_subchapter,
    )
    due_questions = load_due_questions(
        course=selected_course,
        chapter=selected_chapter,
        subchapter=selected_subchapter,
    )
    due_ids = due_questions["id"].astype(int).tolist()

    st.session_state.setdefault("practice_filter_signature", None)
    st.session_state.setdefault("practice_queue_ids", [])
    st.session_state.setdefault("practice_answer_visible", False)

    if st.session_state.practice_filter_signature != filter_signature:
        st.session_state.practice_filter_signature = filter_signature
        st.session_state.practice_queue_ids = due_ids.copy()
        st.session_state.practice_answer_visible = False
    else:
        valid_due_ids = set(due_ids)
        st.session_state.practice_queue_ids = [
            question_id
            for question_id in st.session_state.practice_queue_ids
            if question_id in valid_due_ids
        ]
        queued_ids = set(st.session_state.practice_queue_ids)
        st.session_state.practice_queue_ids.extend(
            question_id for question_id in due_ids if question_id not in queued_ids
        )

    if not st.session_state.practice_queue_ids:
        st.success("All caught up for today!", icon=":material/check_circle:")
        return

    current_id = int(st.session_state.practice_queue_ids[0])
    current_rows = due_questions[due_questions["id"] == current_id]
    if current_rows.empty:
        st.session_state.practice_queue_ids.pop(0)
        st.session_state.practice_answer_visible = False
        st.rerun()
    card = current_rows.iloc[0]

    st.caption(
        f"{len(st.session_state.practice_queue_ids)} due question"
        f"{'s' if len(st.session_state.practice_queue_ids) != 1 else ''} remaining"
    )
    with st.container(border=True):
        with st.container(horizontal=True):
            st.badge(str(card["course"]), color="blue")
            st.badge(str(card["chapter"]), color="gray")
            st.badge(str(card["subchapter"]), color="violet")
        st.subheader("Question")
        st.markdown(str(card["question"]))

    if not st.session_state.practice_answer_visible:
        if st.button(
            "Show answer",
            type="primary",
            icon=":material/visibility:",
            width="stretch",
        ):
            st.session_state.practice_answer_visible = True
            st.rerun()
        return

    with st.container(border=True):
        st.subheader("Answer")
        st.markdown(str(card["answer"]))

    st.subheader("Rate your recall")
    st.caption("Choose the level that best describes how well you remembered the answer.")
    with st.container(horizontal=True, horizontal_alignment="distribute"):
        for level, (label, interval_days) in RATING_LEVELS.items():
            interval_text = (
                "Repeat today"
                if interval_days == 0
                else f"Review in {interval_days} day{'s' if interval_days != 1 else ''}"
            )
            if st.button(
                f"Level {level}: {label}",
                help=interval_text,
                key=f"practice_rate_{current_id}_{level}",
            ):
                next_review = rate_question(current_id, level)
                st.session_state.practice_queue_ids.pop(0)
                if level == 1:
                    st.session_state.practice_queue_ids.append(current_id)
                st.session_state.practice_answer_visible = False
                st.toast(
                    f"Rated Level {level} ({label}). Next review: "
                    f"{next_review.strftime('%d %b %Y')}."
                )
                st.rerun()


def manage_questions_page() -> None:
    """Display question creation and management controls."""
    st.title("Add & Manage Questions")

    st.header("Add a question")
    st.caption("Question and answer text can include Markdown and fenced code blocks.")

    with st.form("add_question_form", clear_on_submit=True):
        course = st.selectbox("Course", DEFAULT_COURSES)
        chapter = st.text_input(
            "Chapter name",
            placeholder="For example: Data structures",
        )
        subchapter = st.text_input(
            "Subchapter name",
            placeholder="For example: Binary search trees",
        )
        question = st.text_area(
            "Question text",
            placeholder="Enter the recall prompt. Markdown and code are supported.",
            height=150,
        )
        answer = st.text_area(
            "Answer text",
            placeholder="Enter the answer. Markdown and code are supported.",
            height=180,
        )
        submitted = st.form_submit_button(
            "Add question",
            type="primary",
            icon=":material/add:",
        )

    if submitted:
        if not all(
            (
                chapter.strip(),
                subchapter.strip(),
                question.strip(),
                answer.strip(),
            )
        ):
            st.error("Complete the chapter, subchapter, question, and answer fields.")
        else:
            add_question(course, chapter, subchapter, question, answer)
            st.success("Question added successfully and scheduled for review today.")

    st.divider()
    st.header("Manage existing questions")

    filter_course = st.selectbox(
        "Filter by course",
        ("All courses",) + DEFAULT_COURSES,
        key="manage_filter_course",
    )
    selected_course = None if filter_course == "All courses" else filter_course

    chapter_conditions = {"course": selected_course} if selected_course else None
    chapter_options = load_distinct_values("chapter", chapter_conditions)
    filter_chapter = st.selectbox(
        "Filter by chapter",
        ["All chapters", *chapter_options],
        key="manage_filter_chapter",
    )
    selected_chapter = None if filter_chapter == "All chapters" else filter_chapter

    subchapter_conditions: dict[str, str] = {}
    if selected_course:
        subchapter_conditions["course"] = selected_course
    if selected_chapter:
        subchapter_conditions["chapter"] = selected_chapter
    subchapter_options = load_distinct_values(
        "subchapter",
        subchapter_conditions or None,
    )
    filter_subchapter = st.selectbox(
        "Filter by subchapter",
        ["All subchapters", *subchapter_options],
        key="manage_filter_subchapter",
    )
    selected_subchapter = (
        None if filter_subchapter == "All subchapters" else filter_subchapter
    )

    questions = load_questions(
        course=selected_course,
        chapter=selected_chapter,
        subchapter=selected_subchapter,
    )

    if questions.empty:
        st.info("No questions match the selected filters.")
        return

    st.caption(f"Showing {len(questions)} question{'s' if len(questions) != 1 else ''}.")
    st.dataframe(
        questions,
        hide_index=True,
        column_config={
            "id": st.column_config.NumberColumn("ID", width="small"),
            "course": "Course",
            "chapter": "Chapter",
            "subchapter": "Subchapter",
            "question": st.column_config.TextColumn("Question", width="large"),
            "answer": st.column_config.TextColumn("Answer", width="large"),
            "level": st.column_config.NumberColumn("Level", width="small"),
            "last_reviewed": st.column_config.DateColumn("Last reviewed"),
            "next_review": st.column_config.DateColumn("Next review"),
            "review_count": st.column_config.NumberColumn("Reviews", width="small"),
        },
    )

    st.subheader("Delete a question")
    question_ids = questions["id"].astype(int).tolist()
    question_lookup = {
        int(row["id"]): f"#{int(row['id'])} — {str(row['question'])[:80]}"
        for _, row in questions.iterrows()
    }
    question_id = st.selectbox(
        "Question to delete",
        question_ids,
        format_func=question_lookup.get,
        key="delete_question_id",
    )
    confirm_delete = st.checkbox(
        "I understand that this action cannot be undone.",
        key="confirm_question_delete",
    )
    if st.button(
        "Delete question",
        icon=":material/delete:",
        disabled=not confirm_delete,
    ):
        if delete_question(int(question_id)):
            st.success(f"Question #{question_id} was deleted.")
            st.rerun()
        else:
            st.error("The question could not be found.")


def analytics_page() -> None:
    """Display course mastery, forgetting status, and hierarchy progress."""
    st.title("Analytics & Progress")
    st.caption("Track mastery across courses and spot material that needs attention.")

    questions = load_questions()

    st.header("Course mastery")
    with st.container(horizontal=True):
        for course in DEFAULT_COURSES:
            course_questions = questions[questions["course"] == course]
            total_questions = len(course_questions)
            mastered_questions = int(
                course_questions["level"].isin([4, 5]).sum()
            )
            mastered_percent = (
                mastered_questions / total_questions * 100
                if total_questions
                else 0.0
            )
            st.metric(
                course,
                f"{mastered_percent:.1f}% mastered",
                f"{mastered_questions} mastered · {total_questions} total",
                delta_color="off",
                border=True,
            )

    if questions.empty:
        st.info("Add questions to begin tracking analytics.")
        return

    status_counts, breakdown = build_analytics_data(questions)

    st.header("Forgetting curve status")
    with st.container(border=True):
        figure = px.pie(
            status_counts,
            names="Status",
            values="Questions",
            hole=0.58,
            color="Status",
            color_discrete_map={
                "Mastered": "#22c55e",
                "Learning / Repetition": "#eab308",
                "At Risk / Overdue": "#ef4444",
            },
            category_orders={
                "Status": [
                    "Mastered",
                    "Learning / Repetition",
                    "At Risk / Overdue",
                ]
            },
        )
        figure.update_traces(
            textposition="inside",
            textinfo="percent+label",
            hovertemplate="%{label}: %{value} question(s)<extra></extra>",
        )
        figure.update_layout(
            legend_title_text="",
            margin=dict(l=10, r=10, t=20, b=10),
            height=430,
        )
        st.plotly_chart(figure, width="stretch")

    st.header("Chapter and subchapter completion")
    display_breakdown = breakdown.rename(
        columns={
            "course": "Course",
            "chapter": "Chapter",
            "subchapter": "Subchapter",
            "total_questions": "Total questions",
            "mastered_questions": "Mastered questions",
            "completion": "Completion",
        }
    )
    st.dataframe(
        display_breakdown,
        hide_index=True,
        column_config={
            "Course": st.column_config.TextColumn(pinned=True),
            "Total questions": st.column_config.NumberColumn(format="%d"),
            "Mastered questions": st.column_config.NumberColumn(format="%d"),
            "Completion": st.column_config.ProgressColumn(
                format="percent",
                min_value=0,
                max_value=1,
            ),
        },
    )


def settings_page() -> None:
    """Display review activity and CSV backup controls."""
    st.title("Settings & Backup")
    st.caption("Monitor your review consistency and keep a portable copy of your data.")

    questions = load_questions()
    streak = calculate_review_streak(questions["last_reviewed"])

    st.header("Review streak")
    st.metric(
        "Consecutive active days",
        f"{streak} day{'s' if streak != 1 else ''}",
        help=(
            "Counts consecutive calendar days with at least one question whose "
            "latest review date falls on that day. A streak remains current through "
            "the day after the most recent activity."
        ),
        border=True,
    )

    st.header("Backup questions")
    st.write(
        "Download every question and its current spaced-repetition data as a CSV file."
    )
    csv_data = questions.to_csv(index=False).encode("utf-8")
    st.download_button(
        "Download questions CSV",
        data=csv_data,
        file_name=f"study_tracker_questions_{date.today().isoformat()}.csv",
        mime="text/csv",
        icon=":material/download:",
        type="primary",
    )
    st.caption(f"{len(questions)} question{'s' if len(questions) != 1 else ''} ready to export.")


def main() -> None:
    """Initialize the application and render the selected page."""
    st.set_page_config(
        page_title="Active Recall",
        page_icon=":material/psychology:",
        layout="wide",
    )

    initialize_database()

    st.sidebar.title("Active Recall")
    st.sidebar.caption("Study smarter with active recall.")
    selected_page = st.sidebar.radio(
        "Navigation",
        (
            "Active Practice",
            "Add & Manage Questions",
            "Analytics & Progress",
            "Settings & Backup",
        ),
    )

    pages = {
        "Active Practice": active_practice_page,
        "Add & Manage Questions": manage_questions_page,
        "Analytics & Progress": analytics_page,
        "Settings & Backup": settings_page,
    }
    pages[selected_page]()

    st.sidebar.divider()
    st.sidebar.caption("Supported courses")
    for course in DEFAULT_COURSES:
        st.sidebar.markdown(f"- {course}")


if __name__ == "__main__":
    main()
