interface Window {
  recallBackup?: {
    save: (data: {
      version: number;
      exportedAt: string;
      courses: string[];
      questions: unknown[];
      activityDates: string[];
      theme: string;
    }) => Promise<boolean>;
  };
}
