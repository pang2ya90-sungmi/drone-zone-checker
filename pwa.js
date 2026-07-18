// PWA 설치 안내 배너
// - Android/Chrome/Edge: beforeinstallprompt 후 커스텀 버튼으로 유도
// - iOS Safari: 이벤트 안 뜨므로 iOS 감지 후 안내 모달 표시
// - 이미 설치된 상태(display-mode: standalone)면 아무 것도 안 함
// - 사용자가 "나중에" 닫으면 7일간 미표시

const DISMISS_KEY = 'pwa_dismiss_until';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function dismissedRecently() {
  const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
  return Date.now() < until;
}
function dismissFor(days) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400000));
}

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!dismissedRecently() && !isStandalone()) showBanner('android');
});

window.addEventListener('appinstalled', () => {
  hideBanner();
  deferredPrompt = null;
});

function showBanner(kind) {
  const banner = document.getElementById('pwa-banner');
  if (!banner) return;
  banner.dataset.kind = kind;
  banner.querySelector('.pwa-install-btn').style.display =
    kind === 'android' ? 'inline-flex' : 'none';
  banner.querySelector('.pwa-ios-help').style.display =
    kind === 'ios' ? 'inline-flex' : 'none';
  banner.classList.add('show');
}
function hideBanner() {
  document.getElementById('pwa-banner')?.classList.remove('show');
}

async function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === 'accepted') hideBanner();
  else dismissFor(7);
}

function showIosGuide() {
  document.getElementById('pwa-ios-modal').classList.add('open');
  document.getElementById('pwa-backdrop').classList.add('open');
}
function hideIosGuide() {
  document.getElementById('pwa-ios-modal').classList.remove('open');
  document.getElementById('pwa-backdrop').classList.remove('open');
}

window.addEventListener('DOMContentLoaded', () => {
  // iOS는 beforeinstallprompt가 안 오므로 별도 처리
  if (isIOS() && !isStandalone() && !dismissedRecently()) {
    setTimeout(() => showBanner('ios'), 2000);
  }
  document.getElementById('pwa-install').addEventListener('click', triggerInstall);
  document.getElementById('pwa-ios-help').addEventListener('click', showIosGuide);
  document.getElementById('pwa-close').addEventListener('click', () => {
    hideBanner();
    dismissFor(7);
  });
  document.getElementById('pwa-ios-modal-close').addEventListener('click', hideIosGuide);
  document.getElementById('pwa-backdrop').addEventListener('click', hideIosGuide);
});
