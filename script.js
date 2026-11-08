// 頁尾年份
document.getElementById('year').textContent = new Date().getFullYear();

// 手機版選單
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
toggle.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
links.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  })
);

// 聯絡表單：目前用 mailto 開啟使用者的郵件程式
// 若想直接收信，可改接 Formspree 等服務。
const CONTACT_EMAIL = 'you@example.com';
document.getElementById('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const message = form.message.value.trim();
  const subject = encodeURIComponent(`網站留言：${name}`);
  const body = encodeURIComponent(`姓名：${name}\nEmail：${email}\n\n${message}`);
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  form.querySelector('.form-status').textContent = '已開啟郵件程式，謝謝你的留言！';
  form.reset();
});
