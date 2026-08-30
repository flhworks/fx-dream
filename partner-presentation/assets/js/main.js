(() => {
  "use strict";

  const menuButton = document.querySelector(".menu-button");
  const navigation = document.querySelector(".nav-list");
  const progressBar = document.querySelector("#progress-bar");
  const dialog = document.querySelector("#image-dialog");
  const dialogImage = document.querySelector("#dialog-image");
  const dialogCaption = document.querySelector("#dialog-caption");
  const dialogClose = document.querySelector(".dialog-close");
  const pageMain = document.querySelector("main");
  const pageFooter = document.querySelector(".site-footer");
  const mobileLine = document.querySelector(".mobile-line");

  const setPageInert = (isInert) => {
    [pageMain, pageFooter, mobileLine].forEach((element) => {
      if (element) element.inert = isInert;
    });
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    if (!menuButton || !navigation) return;
    navigation.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "メニューを開く");
    document.body.classList.remove("is-menu-open");
    setPageInert(false);
    if (restoreFocus) menuButton.focus();
  };

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const isOpen = navigation.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
      menuButton.setAttribute("aria-label", isOpen ? "メニューを閉じる" : "メニューを開く");
      document.body.classList.toggle("is-menu-open", isOpen);
      setPageInert(isOpen);
      if (isOpen) navigation.querySelector("a")?.focus();
    });

    navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

    document.addEventListener("click", (event) => {
      if (!navigation.classList.contains("is-open")) return;
      if (navigation.contains(event.target) || menuButton.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && navigation.classList.contains("is-open")) {
        closeMenu({ restoreFocus: true });
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) closeMenu();
    });
  }

  const updateProgress = () => {
    if (!progressBar) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0;
    progressBar.style.width = `${progress}%`;
  };

  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);

  if (dialog && dialogImage && dialogCaption && dialogClose) {
    document.querySelectorAll("[data-full]").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const source = trigger.getAttribute("data-full");
        const caption = trigger.getAttribute("data-caption") || "サイン表示例";
        const thumbnail = trigger.querySelector("img");
        if (!source) return;
        dialogImage.src = source;
        dialogImage.alt = thumbnail?.alt || caption;
        dialogCaption.textContent = caption;
        dialog.showModal();
      });
    });

    const closeDialog = () => {
      dialog.close();
    };

    dialogClose.addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", () => {
      dialogImage.removeAttribute("src");
      dialogImage.alt = "";
    });
  }
})();
