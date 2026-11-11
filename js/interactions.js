"use strict";
document.querySelectorAll("#order [data-product-line]").forEach((card) => {
  const content = card.querySelector(".gs-work-content");
  if (!content) return;
  const badge = document.createElement("span");
  badge.className = "ju-line-badge";
  badge.textContent = card.dataset.productLine;
  content.append(badge);
});

document.querySelectorAll("[data-ju-privacy-modal]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    const dialog = document.querySelector("#privacy-dialog");
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  });
});

document.querySelectorAll("dialog").forEach((dialog) => {
  const closeBtn = dialog.querySelector(".dialog-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => dialog.close());
  }
});

const simuToggleBtn = document.querySelector("#simu-toggle-btn");
const simuLabelPro = document.querySelector("#simu-label-pro");
if (simuToggleBtn) {
  simuToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "./PRO.html";
  });
}
if (simuLabelPro) {
  simuLabelPro.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "./PRO.html";
  });
}

const ytTab = document.querySelector("#ju-yt-tab");
const ytModal = document.querySelector("#ju-yt-modal");
const ytModalStage = document.querySelector("#ju-yt-modal-stage");
const ytModalClose = document.querySelector("#ju-yt-modal-close");

if (ytTab && ytModal && ytModalStage && ytModalClose) {
  let lockedScrollY = 0;
  const blockBgScroll = (e) => {
    if (!ytModal.hidden) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const blockBgScrollKeys = (e) => {
    if (
      !ytModal.hidden &&
      [" ", "PageUp", "PageDown", "End", "Home", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      e.preventDefault();
    }
  };
  const enforceLockedScroll = () => {
    if (!ytModal.hidden && Math.abs(window.scrollY - lockedScrollY) > 1) {
      window.scrollTo(0, lockedScrollY);
    }
  };

  const openYtModal = () => {
    lockedScrollY = window.scrollY;
    ytTab.classList.remove("is-hover");
    ytTab.hidden = true;
    document.documentElement.classList.add("yt-modal-open");
    ytModal.hidden = false;
    ytTab.blur();
    window.addEventListener("wheel", blockBgScroll, { passive: false, capture: true });
    window.addEventListener("touchmove", blockBgScroll, { passive: false, capture: true });
    window.addEventListener("keydown", blockBgScrollKeys, { passive: false, capture: true });
    window.addEventListener("scroll", enforceLockedScroll, { passive: true });
    if (!ytModalStage.querySelector("iframe")) {
      const iframe = document.createElement("iframe");
      iframe.className = "ju-yt-modal__iframe";
      iframe.src = "https://www.youtube.com/embed/jDQskNZH074?autoplay=1&rel=0&playsinline=1";
      iframe.title = "YouTube video player";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      ytModalStage.appendChild(iframe);
    }
  };
  const closeYtModal = () => {
    ytModalStage.innerHTML = "";
    ytModal.hidden = true;
    document.documentElement.classList.remove("yt-modal-open");
    ytTab.classList.remove("is-hover");
    ytTab.hidden = false;
    window.removeEventListener("wheel", blockBgScroll, { capture: true });
    window.removeEventListener("touchmove", blockBgScroll, { capture: true });
    window.removeEventListener("keydown", blockBgScrollKeys, { capture: true });
    window.removeEventListener("scroll", enforceLockedScroll);
  };
  ytTab.addEventListener("mouseenter", () => ytTab.classList.add("is-hover"));
  ytTab.addEventListener("mouseleave", () => ytTab.classList.remove("is-hover"));
  ytTab.addEventListener("click", openYtModal);
  ytModalClose.addEventListener("click", closeYtModal);
  ytModal.addEventListener("click", (e) => {
    if (e.target === ytModal) closeYtModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ytModal.hidden) {
      closeYtModal();
    }
  });
}

const contactForm = document.querySelector("#contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const fields = [
      ["お名前 (Name)", "form-name"],
      ["返信先メールアドレス (Email)", "form-email"],
      ["会社名 (Company)", "form-company"],
      ["メッセージ (Message)", "form-message"],
    ];
    const body = fields
      .map(([label, id]) => {
        const el = document.getElementById(id);
        return `${label}:\n${el ? el.value : ""}`;
      })
      .join("\n\n");
    location.href = `mailto:originalsoccerball@gmail.com?subject=${encodeURIComponent("ウェブサイトからのお問い合わせ")}&body=${encodeURIComponent(body)}`;
  });
}
