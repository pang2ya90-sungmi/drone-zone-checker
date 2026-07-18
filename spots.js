// 드론 촬영 스팟 (드론 맛집) 저장/표시
// - localStorage에 저장 (기기별 독립)
// - 사진은 canvas로 리사이즈(최대 1000px, JPEG 0.8) 후 base64로 저장
// - 스팟 위치가 비행금지/제한 구역이면 저장 시 경고

const SPOTS_KEY = 'drone_spots_v1';

function loadSpots() {
  try { return JSON.parse(localStorage.getItem(SPOTS_KEY) || '[]'); }
  catch { return []; }
}
function saveSpots(spots) {
  try { localStorage.setItem(SPOTS_KEY, JSON.stringify(spots)); return true; }
  catch (e) {
    alert('저장 공간이 부족합니다. 오래된 스팟을 삭제하거나 사진 크기를 줄여주세요.');
    return false;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function resizePhoto(file, maxSize = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const scale = maxSize / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let spotLayer = null;
let addMode = false;

function makeSpotIcon(rating) {
  const star = rating >= 4 ? '⭐' : '';
  return L.divIcon({
    className: 'spot-marker-wrap',
    html: `<div class="spot-marker">📸${star ? `<span class="spot-star">${star}</span>` : ''}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 32],
    popupAnchor: [0, -28],
  });
}

function renderSpots(map) {
  if (spotLayer) map.removeLayer(spotLayer);
  const spots = loadSpots();
  spotLayer = L.layerGroup(
    spots.map(s => {
      const m = L.marker([s.lat, s.lng], { icon: makeSpotIcon(s.rating) });
      m.bindPopup(renderSpotPopup(s), { maxWidth: 300, minWidth: 220 });
      return m;
    })
  ).addTo(map);

  // 목록 사이드바 업데이트
  renderSpotList();
}

function renderSpotPopup(s) {
  const stars = s.rating ? '⭐'.repeat(s.rating) : '';
  const zoneNote = zoneWarningFor(s.lat, s.lng);
  return `
    <div class="spot-popup">
      <div class="spot-name">📸 ${escapeHtml(s.name)}</div>
      ${stars ? `<div class="spot-rating">${stars}</div>` : ''}
      ${s.photo ? `<img src="${s.photo}" class="spot-photo" alt="">` : ''}
      ${s.desc ? `<div class="spot-desc">${escapeHtml(s.desc)}</div>` : ''}
      ${zoneNote}
      <div class="spot-meta">${new Date(s.createdAt).toLocaleDateString('ko-KR')}</div>
      <div class="spot-actions">
        <button data-action="delete-spot" data-id="${s.id}">🗑️ 삭제</button>
      </div>
    </div>`;
}

function zoneWarningFor(lat, lng) {
  if (!window.pointInPolygon || !window.ZONES) return '';
  const hits = window.ZONES.features.filter(f => window.pointInPolygon([lng, lat], f.geometry));
  if (hits.some(h => h.properties.kind === 'prohibited')) {
    return `<div class="spot-warn danger">🚫 이 지역은 비행금지구역입니다</div>`;
  }
  if (hits.some(h => h.properties.kind === 'restricted')) {
    return `<div class="spot-warn warn">⚠️ 비행제한구역 (사전 신청 필요)</div>`;
  }
  return '';
}

function renderSpotList() {
  const el = document.getElementById('spot-list');
  if (!el) return;
  const spots = loadSpots().sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.createdAt.localeCompare(a.createdAt));
  if (!spots.length) {
    el.innerHTML = `<div class="spot-empty">저장된 스팟이 없어요.<br>지도에서 📸 버튼을 누르고 위치를 찍어보세요.</div>`;
    return;
  }
  el.innerHTML = spots.map(s => `
    <div class="spot-row" data-id="${s.id}">
      ${s.photo ? `<img src="${s.photo}" class="spot-thumb">` : `<div class="spot-thumb-blank">📸</div>`}
      <div class="spot-row-body">
        <div class="spot-row-name">${escapeHtml(s.name)}</div>
        <div class="spot-row-sub">${s.rating ? '⭐'.repeat(s.rating) : ''} · ${new Date(s.createdAt).toLocaleDateString('ko-KR')}</div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.spot-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const s = loadSpots().find(x => x.id === id);
      if (s) {
        window.mapRef.setView([s.lat, s.lng], 15);
        // 팝업 열기: 해당 마커 찾기
        spotLayer.eachLayer(m => {
          const ll = m.getLatLng();
          if (Math.abs(ll.lat - s.lat) < 1e-9 && Math.abs(ll.lng - s.lng) < 1e-9) m.openPopup();
        });
        if (window.innerWidth <= 900) closeSpotPanel();
      }
    });
  });
}

function deleteSpot(id) {
  if (!confirm('이 스팟을 삭제할까요?')) return;
  const spots = loadSpots().filter(s => s.id !== id);
  saveSpots(spots);
  renderSpots(window.mapRef);
}

function enterAddMode() {
  addMode = true;
  document.body.classList.add('add-spot-mode');
  document.getElementById('spot-hint').classList.add('show');
  document.getElementById('spot-add').classList.add('active');
  // 시뮬레이션 모드가 켜져 있으면 끄기 (지도 클릭 충돌 방지)
  const sim = document.getElementById('simulate');
  if (sim && /ON/.test(sim.textContent)) sim.click();
}
function exitAddMode() {
  addMode = false;
  document.body.classList.remove('add-spot-mode');
  document.getElementById('spot-hint').classList.remove('show');
  document.getElementById('spot-add').classList.remove('active');
}

function openSpotForm(lat, lng, prefillName = '') {
  document.getElementById('spot-form').classList.add('open');
  document.getElementById('spot-backdrop').classList.add('open');
  document.getElementById('spot-lat').value = lat;
  document.getElementById('spot-lng').value = lng;
  document.getElementById('spot-name').value = prefillName || '';
  document.getElementById('spot-desc').value = '';
  document.getElementById('spot-rating').value = 5;
  document.getElementById('spot-photo').value = '';
  document.getElementById('spot-photo-preview').innerHTML = '';
  document.getElementById('spot-name').focus();

  const warn = zoneWarningFor(lat, lng);
  document.getElementById('spot-form-warn').innerHTML = warn;
}
window.openSpotForm = openSpotForm;
function closeSpotForm() {
  document.getElementById('spot-form').classList.remove('open');
  document.getElementById('spot-backdrop').classList.remove('open');
}

async function submitSpotForm(e) {
  e.preventDefault();
  const submit = document.getElementById('spot-submit');
  submit.disabled = true;
  submit.textContent = '저장 중…';

  const spot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lat: parseFloat(document.getElementById('spot-lat').value),
    lng: parseFloat(document.getElementById('spot-lng').value),
    name: document.getElementById('spot-name').value.trim() || '이름 없는 스팟',
    desc: document.getElementById('spot-desc').value.trim(),
    rating: parseInt(document.getElementById('spot-rating').value) || 0,
    photo: null,
    createdAt: new Date().toISOString(),
  };

  const photoFile = document.getElementById('spot-photo').files[0];
  if (photoFile) {
    try { spot.photo = await resizePhoto(photoFile); }
    catch (err) { alert('사진 처리 실패: ' + err.message); }
  }

  const spots = loadSpots();
  spots.push(spot);
  if (saveSpots(spots)) {
    renderSpots(window.mapRef);
    closeSpotForm();
  }
  submit.disabled = false;
  submit.textContent = '저장';
}

function openSpotPanel() {
  document.getElementById('spot-panel').classList.add('open');
  renderSpotList();
}
function closeSpotPanel() {
  document.getElementById('spot-panel').classList.remove('open');
}

window.addEventListener('DOMContentLoaded', () => {
  // 지도 준비 대기 (map은 index.html에서 만든 뒤 window.mapRef에 노출됨)
  const wait = setInterval(() => {
    if (window.mapRef) {
      clearInterval(wait);
      renderSpots(window.mapRef);

      // 지도 클릭 → add 모드면 폼 열기
      window.mapRef.on('click', (e) => {
        if (!addMode) return;
        exitAddMode();
        openSpotForm(e.latlng.lat, e.latlng.lng);
      });
    }
  }, 100);

  // 버튼/이벤트
  document.getElementById('spot-add').addEventListener('click', () => {
    if (addMode) { exitAddMode(); return; }
    // 검색으로 지도에 뜬 결과가 있으면 그 위치로 바로 폼 오픈
    const s = window.lastSearchResult;
    if (s) {
      openSpotForm(s.lat, s.lng, s.label);
      return;
    }
    enterAddMode();
  });
  document.getElementById('spot-panel-open').addEventListener('click', openSpotPanel);
  document.getElementById('spot-panel-close').addEventListener('click', closeSpotPanel);
  document.getElementById('spot-cancel').addEventListener('click', closeSpotForm);
  document.getElementById('spot-backdrop').addEventListener('click', closeSpotForm);
  document.getElementById('spot-form').addEventListener('submit', submitSpotForm);

  // 사진 미리보기
  document.getElementById('spot-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const pv = document.getElementById('spot-photo-preview');
    if (!file) { pv.innerHTML = ''; return; }
    const dataUrl = await resizePhoto(file, 400, 0.7);
    pv.innerHTML = `<img src="${dataUrl}" alt="preview">`;
  });

  // 팝업 안의 삭제/저장 버튼 이벤트 위임
  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-action="delete-spot"]');
    if (del) { deleteSpot(del.dataset.id); return; }

    const save = e.target.closest('[data-action="save-search-as-spot"]');
    if (save) {
      const lat = parseFloat(save.dataset.lat);
      const lng = parseFloat(save.dataset.lng);
      const label = save.dataset.label || '';
      // 열려있던 검색 팝업 닫고 폼 오픈
      if (window.mapRef) window.mapRef.closePopup();
      openSpotForm(lat, lng, label);
    }
  });

  // 구역 데이터가 새로 로드되면 스팟 팝업의 경고 업데이트를 위해 재렌더
  window.addEventListener('zones:loaded', () => {
    if (window.mapRef) renderSpots(window.mapRef);
  });
});
