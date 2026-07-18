// 드론 비행 전 체크리스트
// 컨디션별 그룹: 절대금지 / 신청필요 / 자가확인 / 참고
// 자동 판정 (위치·시간) + 수동 체크박스 (localStorage 저장)

const CHECKLIST = [
  {
    group: 'blocker',
    title: '🔴 절대 비행 금지 사유',
    desc: '하나라도 해당하면 비행하면 안 돼요',
    items: [
      { id: 'in_prohibited', label: '비행금지구역(P-구역) 안에 있음', auto: 'location.prohibited', invert: true },
      { id: 'over_crowd',    label: '인구밀집 지역(경기장·행사장·시장 등) 상공에서 비행', manual: true, invert: true },
      { id: 'over_people',   label: '사람이나 차량 위로 직접 비행', manual: true, invert: true },
      { id: 'accident',      label: '사고·재난 현장 상공', manual: true, invert: true },
      { id: 'sober',         label: '음주·약물 상태 아님', manual: true },
    ],
  },
  {
    group: 'permit',
    title: '🟡 신청·허가 필요',
    desc: '드론 원스톱(drone.onestop.go.kr)에서 미리 신청해야 해요',
    items: [
      { id: 'in_restricted', label: '비행제한구역·관제권 안에 있음', auto: 'location.restricted', needsPermit: true },
      { id: 'night',         label: '일몰~일출 사이(야간)', auto: 'time.night', needsPermit: true },
      { id: 'above_150m',    label: '150m(500ft) 초과 고도로 비행 예정', manual: true, needsPermit: true },
      { id: 'bvlos',         label: '육안 범위를 벗어나는 비행(BVLOS) 예정', manual: true, needsPermit: true },
    ],
  },
  {
    group: 'selfcheck',
    title: '🟢 자가 확인',
    desc: '조종자 스스로 판단해서 안전 확보',
    items: [
      { id: 'wind',       label: '풍속 5m/s 이하 (나뭇잎이 세게 흔들리지 않음)', manual: true },
      { id: 'weather',    label: '비·눈·안개 없음, 시야 확보', manual: true },
      { id: 'battery',    label: '배터리 완충 (착륙까지 여유 20%)', manual: true },
      { id: 'propeller',  label: '프로펠러 균열·이물질 없음', manual: true },
      { id: 'controller', label: '컨트롤러/폰 연결 정상, 배터리 충분', manual: true },
      { id: 'return',     label: '이·착륙 지점 확인, RTH 지점 인지', manual: true },
      { id: 'gps_lock',   label: '이륙 전 GPS 신호 안정 (야외)', manual: true },
    ],
  },
  {
    group: 'info',
    title: 'ℹ️ 토이 드론(250g 이하) 특별사항',
    desc: '면제 항목은 있지만, 아래 규정은 그대로 적용됩니다',
    items: [
      { id: 'i1', label: '장치 신고 · 조종자 자격증 → 면제', info: true },
      { id: 'i2', label: '보험 가입 의무 → 면제(사업용 아닌 경우)', info: true },
      { id: 'i3', label: '비행공역 제한 → 동일 적용', info: true },
      { id: 'i4', label: '150m 고도 제한 → 동일 적용', info: true },
      { id: 'i5', label: '야간·군중 상공·관제권 → 동일하게 신청 필요', info: true },
      { id: 'i6', label: '기체 무게가 250g 넘거나 사업용이면 소유자 등록 필요', info: true },
    ],
  },
];

const MANUAL_KEY = 'checklist_manual_v1';

function loadManual() {
  try { return JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}'); } catch { return {}; }
}
function saveManual(state) {
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(state)); } catch {}
}

// 야간 판정: 간이식으로 오전 5시 이전 / 오후 8시 이후를 야간으로 취급
// (정확히는 위치별 일몰/일출 필요 — 나중에 sunrise-sunset API로 교체)
function isNight(date = new Date()) {
  const h = date.getHours();
  return h < 5 || h >= 20;
}

// 현재 컨텍스트(위치, 시간) 조회
function getContext() {
  const ctx = { location: { prohibited: false, restricted: false, names: { prohibited: [], restricted: [] } } };
  const meMarker = window.meMarkerRef;
  const zones = window.ZONES;
  if (meMarker && zones) {
    const ll = meMarker.getLatLng();
    const hits = zones.features.filter(f => window.pointInPolygon([ll.lng, ll.lat], f.geometry));
    hits.forEach(h => {
      const k = h.properties.kind;
      if (k === 'prohibited') { ctx.location.prohibited = true; ctx.location.names.prohibited.push(h.properties.name); }
      if (k === 'restricted') { ctx.location.restricted = true; ctx.location.names.restricted.push(h.properties.name); }
    });
  } else {
    ctx.location.unknown = true;
  }
  ctx.time = { night: isNight() };
  return ctx;
}

function renderChecklist() {
  const root = document.getElementById('cl-body');
  if (!root) return;
  const manual = loadManual();
  const ctx = getContext();

  let blockerFail = 0, permitFail = 0, selfPending = 0, selfTotal = 0;

  const html = CHECKLIST.map(group => {
    const items = group.items.map(it => {
      let state = null; // 'pass' | 'fail' | 'pending' | 'info'
      let hint = '';
      if (it.info) {
        state = 'info';
      } else if (it.auto) {
        const [scope, key] = it.auto.split('.');
        const v = ctx[scope]?.[key];
        if (ctx.location.unknown && scope === 'location') {
          state = 'pending'; hint = '위치 정보 없음';
        } else if (it.invert) {
          state = v ? 'fail' : 'pass';
          if (v && ctx.location.names?.[key]) hint = ctx.location.names[key].join(', ');
        } else if (it.needsPermit) {
          state = v ? 'permit' : 'pass';
          if (v && ctx.location.names?.[key]) hint = ctx.location.names[key].join(', ');
          if (v && key === 'night') hint = '야간 비행은 사전 승인 필요';
        }
      } else if (it.manual) {
        const checked = !!manual[it.id];
        if (it.needsPermit) {
          state = checked ? 'permit' : 'pending';
        } else if (it.invert) {
          state = checked ? 'fail' : 'pending';
        } else {
          state = checked ? 'pass' : 'pending';
        }
      }

      // 카운팅
      if (group.group === 'blocker' && state === 'fail') blockerFail++;
      if (group.group === 'permit' && state === 'permit') permitFail++;
      if (group.group === 'selfcheck') {
        selfTotal++;
        if (state === 'pending') selfPending++;
      }

      const canCheck = !!it.manual;
      const checked = canCheck && !!manual[it.id];

      const badgeMap = {
        pass:    ['✅', '#10b981'],
        fail:    ['🚫', '#ef4444'],
        permit:  ['📝', '#f59e0b'],
        pending: ['⬜',  '#94a3b8'],
        info:    ['ℹ️', '#3b82f6'],
      };
      const [icon, color] = badgeMap[state] || badgeMap.pending;

      return `
        <label class="cl-item ${canCheck ? 'clickable' : ''}" data-id="${it.id}">
          <span class="cl-badge" style="background:${color}">${icon}</span>
          <span class="cl-label">${it.label}${hint ? `<span class="cl-hint">${hint}</span>` : ''}</span>
          ${canCheck ? `<input type="checkbox" ${checked ? 'checked' : ''} data-id="${it.id}" />` : '<span style="width:20px"></span>'}
        </label>`;
    }).join('');

    return `
      <section class="cl-group">
        <h3>${group.title}</h3>
        <p class="cl-desc">${group.desc}</p>
        ${items}
      </section>`;
  }).join('');

  root.innerHTML = html;

  // 요약
  const summary = document.getElementById('cl-summary');
  const parts = [];
  if (blockerFail > 0) parts.push(`<span style="color:#ef4444;font-weight:700;">🚫 비행 불가 ${blockerFail}건</span>`);
  if (permitFail > 0) parts.push(`<span style="color:#f59e0b;font-weight:700;">📝 신청 필요 ${permitFail}건</span>`);
  if (blockerFail === 0 && permitFail === 0 && selfPending === 0) {
    parts.push(`<span style="color:#10b981;font-weight:700;">✅ 비행 준비 완료</span>`);
  } else if (blockerFail === 0 && permitFail === 0) {
    parts.push(`<span style="color:#64748b;">⬜ 자가확인 ${selfPending}/${selfTotal} 남음</span>`);
  }
  summary.innerHTML = parts.join(' · ');

  // 체크박스 이벤트
  root.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const id = cb.dataset.id;
      const m = loadManual();
      m[id] = cb.checked;
      saveManual(m);
      renderChecklist();
    });
  });
  root.querySelectorAll('.cl-item.clickable').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const cb = el.querySelector('input[type=checkbox]');
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  });
}

function openChecklist() {
  document.getElementById('cl-sheet').classList.add('open');
  document.getElementById('cl-backdrop').classList.add('open');
  renderChecklist();
}
function closeChecklist() {
  document.getElementById('cl-sheet').classList.remove('open');
  document.getElementById('cl-backdrop').classList.remove('open');
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cl-open').addEventListener('click', openChecklist);
  document.getElementById('cl-close').addEventListener('click', closeChecklist);
  document.getElementById('cl-backdrop').addEventListener('click', closeChecklist);
  document.getElementById('cl-reset').addEventListener('click', () => {
    if (confirm('모든 수동 체크를 초기화할까요?')) {
      localStorage.removeItem(MANUAL_KEY);
      renderChecklist();
    }
  });
  // 지도 상태 갱신 시 체크리스트도 반영
  window.addEventListener('zones:loaded', () => {
    if (document.getElementById('cl-sheet').classList.contains('open')) renderChecklist();
  });
});
