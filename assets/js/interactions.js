'use strict';
document.querySelectorAll('#order [data-product-line]').forEach(card => {
  const content = card.querySelector('.gs-work-content');
  if (!content) return;
  const badge = document.createElement('span');
  badge.className = 'ju-line-badge';
  badge.textContent = card.dataset.productLine;
  content.append(badge);
});

document.querySelectorAll('[data-ju-privacy-modal]').forEach(button => {
  button.addEventListener('click', event => {
    event.preventDefault();
    const dialog = document.querySelector('#privacy-dialog');
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  });
});

document.querySelectorAll('dialog').forEach(dialog => {
  const closeBtn = dialog.querySelector('.dialog-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dialog.close());
  }
});

const simuToggleBtn = document.querySelector('#simu-toggle-btn');
const simuWrapper = document.querySelector('#simu-collapse-target');
const simuEmpty = document.querySelector('#simu-empty');
if (simuToggleBtn && simuWrapper) {
  simuToggleBtn.addEventListener('click', () => {
    const isHidden = simuWrapper.classList.toggle('is-hidden');
    simuToggleBtn.classList.toggle('is-off', isHidden);
    simuToggleBtn.setAttribute('aria-pressed', String(!isHidden));
    if (simuEmpty) simuEmpty.hidden = !isHidden;
  });
}

const contactForm = document.querySelector('#contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const fields = [
      ['お名前 (Name)', 'form-name'],
      ['返信先メールアドレス (Email)', 'form-email'],
      ['会社名 (Company)', 'form-company'],
      ['メッセージ (Message)', 'form-message']
    ];
    const body = fields.map(([label, id]) => {
      const el = document.getElementById(id);
      return `${label}:\n${el ? el.value : ''}`;
    }).join('\n\n');
    location.href = `mailto:originalsoccerball@gmail.com?subject=${encodeURIComponent('ウェブサイトからのお問い合わせ')}&body=${encodeURIComponent(body)}`;
  });
}
