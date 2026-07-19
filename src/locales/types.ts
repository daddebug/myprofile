export type Locale = "zh" | "en";

export type CommonMessages = {
  brand: { name: string; subtitle: string; homeLabel: string };
  nav: {
    home: string;
    work: string;
    play: string;
    about: string;
    contact: string;
    sayHello: string;
    openMenu: string;
    closeMenu: string;
  };
  language: { chinese: string; english: string; label: string };
  project: {
    viewProject: string;
    back: string;
    backToArchive: string;
    nextProject: string;
    previousProject: string;
    englishInProgress: string;
    chineseAvailable: string;
    viewChineseVersion: string;
  };
  homeEditor: {
    editHome: string;
    doneEditing: string;
    saving: string;
    savedLocally: string;
    saveError: string;
    uploadCover: string;
    changeCover: string;
    replaceCover: string;
    removeCover: string;
    confirmRemove: string;
    unsupportedFile: string;
    fileTooLarge: string;
    homepageCoverTitle: string;
    homepageCoverHelper: string;
    emptyCover: string;
  };
  footer: { title: string; description: string; email: string };
};
