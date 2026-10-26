/**
 * Standup Wrapped - Financial Times Editorial Logic
 * Palette:
 *   Yale Blue:      #003c57 (Ink / Major Lines)
 *   Eggshell:       #f4eddb (Paper Canvas)
 *   Strawberry Red: #e83f40 (Highlight / Trendline)
 *   Pacific Blue:   #43bccd (Data Line / Fills)
 *   Jungle Teal:    #679289 (Secondary Series)
 */

const PALETTE = {
  yaleBlue: '#003c57',
  eggshell: '#f4eddb',
  strawberryRed: '#e83f40',
  pacificBlue: '#43bccd',
  jungleTeal: '#679289'
};

const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_MONO = '"Metric-Web", "SF Mono", "Consolas", "Liberation Mono", Menlo, monospace';
const FONT_SERIF = '"Financier Display", Georgia, serif';

let metricsData = null;
let currentChart = null;
let currentView = 'timeline';
let currentFilter = 'all';
let showTrendline = true;
let showMilestones = true;
let currentTheme = 'light';
let allTeamMembers = [];
let lastInspectedRecord = null;
let currentNomineeSort = 'weighted';
let currentHeatmapMetric = 'weighted'; // 'weighted' or 'raw'
let selectedHeatmapSender = 'Leander';
let activeHeatmapHover = null;
let currentSection2View = 'personal'; // 'personal' or 'heatmap'

// Disable animations globally for instant, Financial Times style responsive interactions
if (window.Chart) {
  Chart.defaults.animation = false;
  Chart.defaults.animations = false;
}

// Custom Tooltip Positioner: Anchor tooltip statically at the top-center of chartArea
if (window.Chart && Chart.Tooltip && Chart.Tooltip.positioners) {
  Chart.Tooltip.positioners.topCenter = function(items, eventPosition) {
    if (!items || !items.length) return false;
    const chart = this.chart;
    const { chartArea } = chart;
    if (!chartArea) return false;
    return {
      x: (chartArea.left + chartArea.right) / 2,
      y: chartArea.top + 6
    };
  };
}

// 1. Data Loader
async function loadMetricsData() {
  if (window.STANDUP_METRICS) return window.STANDUP_METRICS;
  try {
    const res = await fetch('./data/standup_metrics.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (window.STANDUP_METRICS) return window.STANDUP_METRICS;
    throw err;
  }
}

// 2. Populate Stat Strip
function renderKPIs(summary) {
  document.getElementById('header-total-standups').textContent = summary.total_standups;
  document.getElementById('kpi-total-standups').textContent = summary.total_standups;
  document.getElementById('kpi-date-range').textContent = `${summary.date_range.start} – ${summary.date_range.end}`;
  document.getElementById('kpi-avg-size').textContent = `${summary.standup_size.average}`;
  document.getElementById('kpi-min-max').textContent = `${summary.standup_size.min} – ${summary.standup_size.max}`;
  document.getElementById('kpi-total-team').textContent = summary.total_unique_participants;
  
  const filterAllBtn = document.getElementById('filter-all-btn');
  if (filterAllBtn) {
    filterAllBtn.textContent = `All (${summary.total_standups})`;
  }
  const footerCount = document.getElementById('footer-count');
  if (footerCount) {
    footerCount.textContent = summary.total_standups;
  }
}

// 3. Helper: Moving average calculation
function calculateMovingAverage(dataPoints, windowSize = 10) {
  const result = [];
  for (let i = 0; i < dataPoints.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const windowSlice = dataPoints.slice(start, i + 1);
    const sum = windowSlice.reduce((acc, curr) => acc + curr, 0);
    result.push(Number((sum / windowSlice.length).toFixed(1)));
  }
  return result;
}

// 4. Timeline records filter
function getFilteredRecords() {
  const all = metricsData.daily_standups;
  if (currentFilter === '2025') {
    return all.filter(r => r.iso_date.startsWith('2025'));
  }
  if (currentFilter === '2026') {
    return all.filter(r => r.iso_date.startsWith('2026'));
  }
  return all;
}

// 5. Update Distinct Attendee Roster on the Right
function renderRosterForTimeline(record) {
  const titleEl = document.getElementById('roster-title');
  const countEl = document.getElementById('roster-count');
  const dateEl = document.getElementById('roster-date');
  const listEl = document.getElementById('roster-list');

  if (!record || !listEl) return;
  lastInspectedRecord = record;

  titleEl.textContent = 'Session Roster';
  dateEl.textContent = `Date: ${record.date}`;
  countEl.textContent = `${record.people_count} / ${allTeamMembers.length}`;

  const presentSet = new Set(record.attendees || []);

  listEl.innerHTML = allTeamMembers.map(name => {
    const isPresent = presentSet.has(name);
    const statusClass = isPresent ? 'present' : 'absent';
    const dot = isPresent ? '●' : '○';
    const tag = isPresent ? 'Present' : 'Absent';
    return `
      <li class="roster-item ${statusClass}" title="${name}: ${tag}">
        <span class="roster-name-area">
          <span class="roster-dot">${dot}</span>
          <span>${name}</span>
        </span>
        <span class="roster-tag">${tag}</span>
      </li>
    `;
  }).join('');
}

// Roster in Distribution View
function renderRosterForDistribution() {
  const titleEl = document.getElementById('roster-title');
  const countEl = document.getElementById('roster-count');
  const dateEl = document.getElementById('roster-date');
  const listEl = document.getElementById('roster-list');

  titleEl.textContent = 'Size Frequency';
  dateEl.textContent = 'Overview';
  countEl.textContent = `${metricsData.summary.total_standups} Total`;

  const dist = metricsData.size_distribution;
  listEl.innerHTML = dist.map(d => {
    const pct = ((d.standup_count / metricsData.summary.total_standups) * 100).toFixed(1);
    const isPeak = d.people_count === 11 || d.people_count === 12;
    return `
      <li class="roster-item ${isPeak ? 'present' : ''}" style="${isPeak ? 'border-left: 2px solid var(--pacific-blue);' : ''}">
        <span class="roster-name-area">
          <span class="roster-dot">${isPeak ? '●' : '○'}</span>
          <span>${d.people_count} People</span>
        </span>
        <span class="roster-tag">${d.standup_count}d (${pct}%)</span>
      </li>
    `;
  }).join('');
}

// Roster in Ranking View
function renderRosterForRanking() {
  const titleEl = document.getElementById('roster-title');
  const countEl = document.getElementById('roster-count');
  const dateEl = document.getElementById('roster-date');
  const listEl = document.getElementById('roster-list');

  titleEl.textContent = 'Team Attendance';
  dateEl.textContent = 'Ranked by Sessions';
  countEl.textContent = `${allTeamMembers.length} People`;

  const people = metricsData.attendance_by_person;
  listEl.innerHTML = people.map(p => {
    const isTop = p.percentage >= 85;
    return `
      <li class="roster-item ${isTop ? 'present' : ''}">
        <span class="roster-name-area">
          <span class="roster-dot">${isTop ? '●' : '○'}</span>
          <span>${p.name}</span>
        </span>
        <span class="roster-tag">${p.attended} (${p.percentage}%)</span>
      </li>
    `;
  }).join('');
}

// Roster in Day-of-Week View
function renderRosterForWeekday() {
  const titleEl = document.getElementById('roster-title');
  const countEl = document.getElementById('roster-count');
  const dateEl = document.getElementById('roster-date');
  const listEl = document.getElementById('roster-list');

  titleEl.textContent = 'Day of Week';
  dateEl.textContent = 'Turnout Summary';
  countEl.textContent = 'Mon – Fri';

  const weekdays = metricsData.weekday_breakdown;
  listEl.innerHTML = weekdays.map(w => {
    const isPeak = w.day === 'Tuesday' || w.day === 'Thursday';
    const isLowest = w.day === 'Friday';
    const tag = isPeak ? 'Peak' : (isLowest ? 'Lowest' : 'Normal');
    const borderStyle = isPeak ? 'border-left: 2px solid var(--pacific-blue);' : (isLowest ? 'border-left: 2px solid var(--strawberry-red);' : '');
    return `
      <li class="roster-item ${isPeak ? 'present' : ''}" style="${borderStyle}">
        <span class="roster-name-area">
          <span class="roster-dot">${isPeak ? '●' : (isLowest ? '▲' : '○')}</span>
          <span>${w.day}</span>
        </span>
        <span class="roster-tag">${w.average} avg (${w.count}d)</span>
      </li>
    `;
  }).join('') + `
    <li style="padding: 10px 6px; font-size: 0.72rem; color: var(--text-dim); line-height: 1.4; border-top: 1px dashed var(--line-subtle); margin-top: 8px;">
      <strong>The Friday Effect:</strong> Friday attendance drops to an average of 11.2, compared to the 12.2 peak on Tuesday and Thursday.
    </li>
  `;
}

// 5e. Helper for 4-letter member abbreviations in heatmap columns
function getMemberAbbr(name) {
  const map = {
    'Bhumika': 'Bhum',
    'Ethan': 'Ethn',
    'Finn': 'Finn',
    'Freya': 'Frey',
    'Helena': 'Heln',
    'Leander': 'Lean',
    'Luke': 'Luke',
    'Matt': 'Matt',
    'Michal': 'Mich',
    'Pukhraj': 'Pukh',
    'Rahul': 'Rahl',
    'Ryan': 'Ryan',
    'Sahil': 'Sahl',
    'Sam': 'Sam',
    'Sasha': 'Sash',
    'Vishal': 'Vish',
    'Will': 'Will'
  };
  return map[name] || name.slice(0, 4);
}

let currentRosterSender = null;

// 5f. Roster in Heatmap View (shows all handoffs from sender, highlighting activeNominee)
function renderRosterForHeatmap(sender, activeNominee) {
  const titleEl = document.getElementById('s2-roster-title') || document.getElementById('roster-title');
  const countEl = document.getElementById('s2-roster-count') || document.getElementById('roster-count');
  const dateEl = document.getElementById('s2-roster-date') || document.getElementById('roster-date');
  const listEl = document.getElementById('s2-roster-list') || document.getElementById('roster-list');
  if (!listEl) return;

  // If the same sender's roster is already rendered, only toggle the active-nominee highlight without rebuilding DOM!
  if (currentRosterSender === sender && listEl.children.length > 0) {
    listEl.querySelectorAll('.roster-item').forEach(li => {
      const isAct = (li.dataset.nominee === activeNominee);
      li.classList.toggle('active-nominee', isAct);
      li.classList.toggle('present', isAct);
    });
    return;
  }
  currentRosterSender = sender;

  const profile = metricsData?.personal_profiles?.[sender];
  const allPicks = profile?.nomination_breakdown?.all_picks || [];

  if (titleEl) titleEl.textContent = 'Handoff Profile';
  if (dateEl) dateEl.textContent = `Sender: ${sender}`;
  if (countEl) countEl.textContent = `${allPicks.length} Nominees`;

  if (allPicks.length === 0) {
    listEl.innerHTML = `
      <li class="roster-item absent" style="justify-content: center; padding: 12px 6px;">
        <span>No handoffs recorded</span>
      </li>
    `;
    return;
  }

  // Sort by active metric
  const sortedPicks = [...allPicks];
  if (currentHeatmapMetric === 'weighted') {
    sortedPicks.sort((a, b) => (b.weighted_score - a.weighted_score) || (b.raw_count - a.raw_count));
  } else {
    sortedPicks.sort((a, b) => (b.raw_count - a.raw_count) || (b.weighted_score - a.weighted_score));
  }

  listEl.innerHTML = sortedPicks.map(p => {
    const isActive = (p.name === activeNominee);
    const emoji = p.relationship_emoji || p.emoji || '🤝';
    const tag = currentHeatmapMetric === 'weighted' 
      ? `${p.weighted_score} pts (${p.raw_count}x)` 
      : `${p.raw_count}x (${p.weighted_score} pts)`;
    
    const diffVal = p.diff_from_expected !== undefined ? p.diff_from_expected : 0.0;
    const diffStr = diffVal >= 0 ? `+${diffVal}` : `${diffVal}`;
    const expVal = p.expected_picks !== undefined ? p.expected_picks : '—';
    
    return `
      <li class="roster-item ${isActive ? 'present active-nominee' : ''}" data-nominee="${p.name}" title="${sender} → ${p.name}: ${p.raw_count} picks, ${p.weighted_score} closeness score (Exp: ${expVal}, Diff: ${diffStr}, ${p.relationship || 'Colleague'})">
        <span class="roster-name-area">
          <span class="roster-dot">${emoji}</span>
          <span>${p.name}</span>
        </span>
        <span class="roster-tag">${tag}</span>
      </li>
    `;
  }).join('');
}

// 6. Update inspection footnote (static, zero-bouncing layout)
function updateHeatmapInspection(hoverData, fallbackSender) {
  const container = document.getElementById('s2-inspection-content') || document.getElementById('inspection-content');
  if (!container) return;

  if (hoverData && hoverData.sender && hoverData.receiver) {
    const { sender, receiver, cellData } = hoverData;
    const emoji = cellData.emoji || '🤝';
    const rel = cellData.relationship || 'Colleague';
    const diffVal = cellData.diff_from_expected !== undefined ? cellData.diff_from_expected : 0.0;
    const diffStr = diffVal >= 0 ? `+${diffVal}` : `${diffVal}`;
    const diffColor = diffVal >= 0 ? PALETTE.pacificBlue : PALETTE.strawberryRed;
    const expVal = cellData.expected_picks !== undefined ? cellData.expected_picks : '—';
    container.innerHTML = `
      <span>
        <strong>${sender} → ${receiver}</strong>: 
        <strong style="color: ${PALETTE.strawberryRed}; font-size: 0.90rem;">${cellData.weighted_score} pts</strong> 
        (${cellData.raw_count} picks) • Exp: <strong>${expVal}</strong> 
        (Diff: <strong style="color: ${diffColor};">${diffStr}</strong>) • 
        Dynamic: <strong>${emoji} ${rel}</strong>
      </span>
    `;
  } else {
    const sender = fallbackSender || selectedHeatmapSender || 'Leander';
    container.innerHTML = `
      <span>
        <strong>Pairwise Nomination Heatmap</strong> (Focus: <strong>${sender}</strong>) • 
        Rows: speaker passing baton; columns: nominee called on next. Hover any cell to inspect breakdown.
      </span>
    `;
  }
}

// 6. Update inspection footnote
function updateInspection(record) {
  const container = document.getElementById('inspection-content');
  if (!record) {
    container.innerHTML = 'Hover over any point on the chart to inspect the date, headcount, and attendees.';
    return;
  }

  // Check if date coincides with any milestone
  const milestoneNotes = (metricsData.team_milestones || [])
    .filter(m => m.date === record.date)
    .map(m => `<span style="color: ${m.type === 'left' ? PALETTE.strawberryRed : PALETTE.pacificBlue}; font-weight:700; margin-left: 8px;">✦ Milestone: ${m.label}</span>`)
    .join(' ');
  
  container.innerHTML = `
    <span>
      <strong>${record.date}</strong>: 
      <strong style="color: ${PALETTE.strawberryRed}; font-size: 0.95rem;">${record.people_count} attendees present</strong>. 
      <span>Check the roster on the right for full attendee status.</span>
      ${milestoneNotes}
    </span>
  `;

  renderRosterForTimeline(record);
}

// 6b. Update Top-Center Fixed HUD Card (Zero Y Bouncing)
function updateTimelineHUD(record, movingAvgVal) {
  const hudEl = document.getElementById('timeline-hud');
  if (!hudEl) return;
  if (currentView !== 'timeline') {
    hudEl.style.display = 'none';
    return;
  }
  hudEl.style.display = 'flex';

  if (!record) return;

  const dateEl = document.getElementById('hud-date');
  const dayEl = document.getElementById('hud-day');
  const countEl = document.getElementById('hud-count');
  const avgEl = document.getElementById('hud-avg');
  const trendPill = document.getElementById('hud-trend-pill');
  const milestoneEl = document.getElementById('hud-milestone');

  if (dateEl) dateEl.textContent = record.date;
  if (dayEl) {
    const d = new Date(record.iso_date + 'T00:00:00');
    dayEl.textContent = d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  if (countEl) countEl.textContent = record.people_count;
  
  if (avgEl && movingAvgVal !== undefined) {
    avgEl.textContent = movingAvgVal;
  }
  if (trendPill) {
    trendPill.style.display = showTrendline ? 'inline-flex' : 'none';
  }

  if (milestoneEl) {
    const milestone = (metricsData.team_milestones || []).find(m => m.date === record.date);
    if (milestone && showMilestones) {
      milestoneEl.textContent = `✦ ${milestone.label}`;
      milestoneEl.style.display = 'inline-block';
    } else {
      milestoneEl.style.display = 'none';
    }
  }
}

// 7. Custom Chart.js Plugin for Team Milestones (Dashed vertical lines + labels along the bottom)
const milestonesPlugin = {
  id: 'teamMilestonesPlugin',
  afterDraw(chart) {
    if (currentView !== 'timeline' || !showMilestones) return;
    if (!metricsData || !metricsData.team_milestones) return;

    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const chartArea = chart.chartArea;
    const isDark = currentTheme === 'dark';

    // Group milestones by date to cleanly combine same-day events (e.g. 28/05/2026: Finn left & Sahil joined)
    const milestonesByDate = {};
    for (const m of metricsData.team_milestones) {
      if (!milestonesByDate[m.date]) milestonesByDate[m.date] = [];
      milestonesByDate[m.date].push(m);
    }

    ctx.save();
    let staggerToggle = 0;

    for (const [dateStr, mList] of Object.entries(milestonesByDate)) {
      const idx = chart.data.labels.indexOf(dateStr);
      if (idx === -1) continue;

      const x = xAxis.getPixelForValue(idx);
      if (x < chartArea.left || x > chartArea.right) continue;

      const hasDeparture = mList.some(m => m.type === 'left');
      const lineColor = hasDeparture 
        ? PALETTE.strawberryRed 
        : (isDark ? PALETTE.pacificBlue : PALETTE.yaleBlue);

      // 1. Draw vertical dashed line from top of chart down to baseline
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = lineColor;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();

      // 2. Format milestone label text
      const labelText = '✦ ' + mList.map(m => m.label).join(' & ');

      // 3. Position along the bottom (in the empty Y=0 to Y=6 space below all data points)
      // Stagger slightly between bottom - 18 and bottom - 36 to avoid horizontal collisions
      const yBottom = chartArea.bottom - 18 - (staggerToggle % 2) * 18;
      staggerToggle++;

      ctx.setLineDash([]);
      ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const boxWidth = textWidth + 10;
      const boxHeight = 16;
      
      // Center box around the dashed line, clamped within chartArea
      let boxX = x - boxWidth / 2;
      if (boxX < chartArea.left + 2) boxX = chartArea.left + 2;
      if (boxX + boxWidth > chartArea.right - 2) boxX = chartArea.right - boxWidth - 2;

      // 4. Draw label box sitting cleanly over/above the dashed line
      ctx.fillStyle = isDark ? '#022232' : PALETTE.eggshell;
      ctx.fillRect(boxX, yBottom - boxHeight / 2, boxWidth, boxHeight);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(boxX, yBottom - boxHeight / 2, boxWidth, boxHeight);

      // 5. Draw text centered in the badge
      ctx.fillStyle = lineColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, boxX + boxWidth / 2, yBottom);
    }

    ctx.restore();
  }
};

// Register plugin once
Chart.register(milestonesPlugin);

// 8. FT-Style Chart Renderer (Strictly Fixed Y and Canvas Box)
function renderChart() {
  const chartCanvas = document.getElementById('standupChart');
  const timelineControls = document.getElementById('timeline-controls');
  const timelineToggles = document.getElementById('timeline-toggles');
  const hud = document.getElementById('timeline-hud');

  const ctx = chartCanvas.getContext('2d');
  if (currentChart) {
    currentChart.destroy();
  }

  const isDark = currentTheme === 'dark';
  const gridColor = isDark ? 'rgba(244, 237, 219, 0.18)' : 'rgba(0, 60, 87, 0.16)';
  const tickColor = isDark ? PALETTE.eggshell : PALETTE.yaleBlue;
  const tooltipBg = isDark ? '#022232' : PALETTE.yaleBlue;
  const tooltipText = PALETTE.eggshell;

  // Maintain fixed height & Y-position: use visibility instead of display:none
  if (currentView === 'timeline') {
    if (timelineControls) timelineControls.style.visibility = 'visible';
    if (timelineToggles) timelineToggles.style.visibility = 'visible';

    const records = getFilteredRecords();
    const labels = records.map(r => r.date);
    const counts = records.map(r => r.people_count);
    const movingAvg = calculateMovingAverage(counts, 10);

    const initialRecord = lastInspectedRecord || records[records.length - 1];
    const initialIdx = records.indexOf(initialRecord);
    renderRosterForTimeline(initialRecord);
    updateTimelineHUD(initialRecord, movingAvg[initialIdx !== -1 ? initialIdx : records.length - 1]);

    const datasets = [
      {
        label: 'Daily Headcount',
        data: counts,
        borderColor: isDark ? PALETTE.pacificBlue : PALETTE.yaleBlue,
        backgroundColor: isDark ? 'rgba(67, 188, 205, 0.12)' : 'rgba(67, 188, 205, 0.18)',
        borderWidth: 1.4,
        fill: true,
        pointRadius: records.length > 100 ? 2 : 3.5,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: PALETTE.pacificBlue,
        pointHoverBorderColor: PALETTE.yaleBlue,
        pointHoverBorderWidth: 2,
        tension: 0.08,
        order: 2
      },
      {
        label: '10-Day Moving Average',
        data: movingAvg,
        borderColor: PALETTE.strawberryRed,
        backgroundColor: 'transparent',
        borderWidth: 2.4,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.3,
        hidden: !showTrendline,
        order: 1
      }
    ];

    currentChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        onHover: (event, activeElements) => {
          if (activeElements.length > 0) {
            const idx = activeElements[0].index;
            const rec = records[idx];
            updateInspection(rec);
            updateTimelineHUD(rec, movingAvg[idx]);
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: {
              color: tickColor,
              boxWidth: 16,
              boxHeight: 2,
              usePointStyle: false,
              font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', size: 11, weight: '600' }
            },
            onClick: (e, legendItem, legend) => {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              const isVisible = ci.isDatasetVisible(index);
              ci.setDatasetVisibility(index, !isVisible);
              ci.update('none');
              if (index === 1) {
                showTrendline = !isVisible;
                const toggle = document.getElementById('toggle-trendline');
                if (toggle) toggle.checked = showTrendline;
                const trendPill = document.getElementById('hud-trend-pill');
                if (trendPill) trendPill.style.display = showTrendline ? 'inline-flex' : 'none';
              }
            }
          },
          tooltip: {
            enabled: false
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: tickColor,
              maxTicksLimit: 10,
              font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', size: 10.5, weight: '500' }
            }
          },
          y: {
            min: 0,
            max: 20,
            grid: {
              color: gridColor,
              drawBorder: false,
              borderDash: [2, 3]
            },
            ticks: {
              color: tickColor,
              stepSize: 2,
              font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', size: 10.5, weight: '500' }
            },
            title: {
              display: true,
              text: 'People in Session',
              color: tickColor,
              font: { size: 11, weight: '600' }
            }
          }
        }
      }
    });

  } else if (currentView === 'distribution') {
    const hud = document.getElementById('timeline-hud');
    if (hud) hud.style.display = 'none';
    if (timelineControls) timelineControls.style.visibility = 'hidden';
    if (timelineToggles) timelineToggles.style.visibility = 'hidden';

    renderRosterForDistribution();

    const dist = metricsData.size_distribution;
    const labels = dist.map(d => `${d.people_count} People`);
    const counts = dist.map(d => d.standup_count);

    currentChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Standup Sessions',
          data: counts,
          backgroundColor: dist.map(d => (d.people_count === 11 || d.people_count === 12) ? PALETTE.pacificBlue : PALETTE.jungleTeal),
          borderColor: isDark ? PALETTE.eggshell : PALETTE.yaleBlue,
          borderWidth: 1,
          borderRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: PALETTE.pacificBlue,
            borderWidth: 1,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            callbacks: {
              label: (item) => ` ${item.raw} Standups (${((item.raw / metricsData.summary.total_standups) * 100).toFixed(1)}%)`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor, font: { size: 11, weight: '600' } }
          },
          y: {
            min: 0,
            grid: { color: gridColor, borderDash: [2, 3] },
            ticks: { color: tickColor, font: { size: 10 } },
            title: { display: true, text: 'Number of Days', color: tickColor, font: { size: 11, weight: '600' } }
          }
        }
      }
    });

  } else if (currentView === 'ranking') {
    const hud = document.getElementById('timeline-hud');
    if (hud) hud.style.display = 'none';
    if (timelineControls) timelineControls.style.visibility = 'hidden';
    if (timelineToggles) timelineToggles.style.visibility = 'hidden';

    renderRosterForRanking();

    const people = metricsData.attendance_by_person;
    const labels = people.map(p => p.name);
    const counts = people.map(p => p.attended);

    currentChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Standups Attended',
          data: counts,
          backgroundColor: PALETTE.jungleTeal,
          hoverBackgroundColor: PALETTE.pacificBlue,
          borderColor: isDark ? PALETTE.eggshell : PALETTE.yaleBlue,
          borderWidth: 1,
          borderRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: PALETTE.pacificBlue,
            borderWidth: 1,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            callbacks: {
              label: (item) => {
                const p = people[item.dataIndex];
                return ` ${p.attended} / ${p.total_standups} standups (${p.percentage}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: tickColor,
              font: { size: 10.5, weight: '600' },
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            min: 0,
            max: metricsData.summary.total_standups,
            grid: { color: gridColor, borderDash: [2, 3] },
            ticks: { color: tickColor, font: { size: 10 } },
            title: { display: true, text: 'Sessions Attended', color: tickColor, font: { size: 11, weight: '600' } }
          }
        }
      }
    });

  } else if (currentView === 'weekday') {
    const hud = document.getElementById('timeline-hud');
    if (hud) hud.style.display = 'none';
    if (timelineControls) timelineControls.style.visibility = 'hidden';
    if (timelineToggles) timelineToggles.style.visibility = 'hidden';

    renderRosterForWeekday();

    const weekdays = metricsData.weekday_breakdown;
    const labels = weekdays.map(w => w.day);
    const averages = weekdays.map(w => w.average);

    currentChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Average Headcount',
          data: averages,
          backgroundColor: weekdays.map(w => {
            if (w.day === 'Tuesday' || w.day === 'Thursday') return PALETTE.pacificBlue;
            if (w.day === 'Friday') return PALETTE.strawberryRed;
            return PALETTE.jungleTeal;
          }),
          borderColor: isDark ? PALETTE.eggshell : PALETTE.yaleBlue,
          borderWidth: 1,
          borderRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: PALETTE.pacificBlue,
            borderWidth: 1,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            callbacks: {
              label: (item) => {
                const w = weekdays[item.dataIndex];
                return ` Average: ${w.average} people (${w.count} sessions, range ${w.min}-${w.max})`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor, font: { size: 11, weight: '700' } }
          },
          y: {
            min: 0,
            max: 16,
            grid: { color: gridColor, borderDash: [2, 3] },
            ticks: { color: tickColor, font: { size: 10 }, stepSize: 2 },
            title: { display: true, text: 'Average Headcount', color: tickColor, font: { size: 11, weight: '600' } }
          }
        }
      }
    });
  }
}

// 8b. Pairwise Nomination Heatmap Renderer
function renderHeatmap() {
  const container = document.getElementById('heatmap-view-container');
  if (!container || !metricsData || !metricsData.nomination_matrix) return;

  const matrixObj = metricsData.nomination_matrix;
  const members = matrixObj.members;
  const maxVal = currentHeatmapMetric === 'weighted' ? matrixObj.max_weighted : matrixObj.max_raw;
  const isDark = currentTheme === 'dark';

  // Update inline legend bar and max label
  const gradBar = document.getElementById('heatmap-gradient-bar');
  const maxLabel = document.getElementById('heatmap-scale-max');
  if (gradBar) {
    if (currentHeatmapMetric === 'raw') {
      gradBar.classList.add('raw-mode');
    } else {
      gradBar.classList.remove('raw-mode');
    }
  }
  if (maxLabel) {
    maxLabel.textContent = `Max: ${maxVal} ${currentHeatmapMetric === 'weighted' ? 'pts' : 'picks'}`;
  }

  // Update toggle button active styling
  const weightedBtn = document.getElementById('heatmap-toggle-weighted');
  const rawBtn = document.getElementById('heatmap-toggle-raw');
  if (weightedBtn && rawBtn) {
    weightedBtn.classList.toggle('active', currentHeatmapMetric === 'weighted');
    rawBtn.classList.toggle('active', currentHeatmapMetric === 'raw');
  }

  // Build Table HTML with full names and dedicated X and Y axis indicators
  let html = `
    <div class="heatmap-matrix-layout">
      <!-- Left Y-Axis Title Strip -->
      <div class="heatmap-y-axis-strip" title="Speaker passing the baton">
        <div class="y-axis-badge">
          <span class="y-axis-arrow">↓</span>
          <span class="y-axis-text">SPEAKER (PASSING BATON)</span>
          <span class="y-axis-arrow">↓</span>
        </div>
      </div>

      <!-- Matrix Table Wrap -->
      <div class="heatmap-table-wrap">
        <table class="heatmap-table" id="heatmap-table">
          <thead>
            <!-- Top X-Axis Super-Header spanning columns -->
            <tr class="heatmap-tr-axis-top">
              <th class="heatmap-th-corner-empty"></th>
              <th class="heatmap-th-x-axis" colspan="${members.length}">
                <div class="heatmap-x-axis-badge">
                  <span class="x-axis-arrow">→</span>
                  <span class="x-axis-text">NOMINATED TEAMMATE (CALLED ON NEXT)</span>
                  <span class="x-axis-arrow">→</span>
                </div>
              </th>
            </tr>

            <!-- Column Header Row with Angled Full Names -->
            <tr class="heatmap-tr-cols">
              <th class="heatmap-th-corner" id="heatmap-th-corner" title="Rows: speaker passing baton">Speaker ↓</th>
  `;

  // Column Headers: Full Names angled at -45 degrees
  members.forEach(m => {
    html += `
      <th class="heatmap-th-col" data-col="${m}" title="Nominated teammate: ${m}">
        <div class="col-header-wrap">
          <span class="col-header-text">${m}</span>
        </div>
      </th>
    `;
  });

  html += `
            </tr>
          </thead>
          <tbody>
  `;

  // Rows
  members.forEach(sender => {
    const isSelectedRow = (sender === selectedHeatmapSender);
    html += `<tr>`;
    html += `<th class="heatmap-th-row ${isSelectedRow ? 'row-active' : ''}" data-row="${sender}" title="Click to focus on ${sender}">${sender}</th>`;

    members.forEach(receiver => {
      if (sender === receiver) {
        html += `<td class="heatmap-cell cell-diagonal" title="${sender} (Self handoff: N/A)">—</td>`;
      } else {
        const cellData = matrixObj.matrix[sender]?.[receiver] || { raw_count: 0, weighted_score: 0, avg_freedom_pct: 0, relationship: 'None', emoji: '—' };
        const val = currentHeatmapMetric === 'weighted' ? cellData.weighted_score : cellData.raw_count;
        const ratio = maxVal > 0 ? (val / maxVal) : 0;
        const displayVal = val > 0 ? (currentHeatmapMetric === 'weighted' ? (val % 1 === 0 ? val : val.toFixed(1)) : val) : '';

        let cellBg;
        let cellColor;

        if (val === 0) {
          cellBg = isDark ? 'rgba(244, 237, 219, 0.03)' : 'rgba(0, 60, 87, 0.03)';
          cellColor = 'var(--text-dim)';
        } else if (currentHeatmapMetric === 'weighted') {
          const alpha = Math.min(0.92, 0.12 + ratio * 0.80).toFixed(2);
          cellBg = `rgba(232, 63, 64, ${alpha})`;
          cellColor = ratio > 0.40 ? '#ffffff' : (isDark ? 'var(--eggshell)' : 'var(--yale-blue)');
        } else {
          if (isDark) {
            const alpha = Math.min(0.90, 0.14 + ratio * 0.76).toFixed(2);
            cellBg = `rgba(67, 188, 205, ${alpha})`;
            cellColor = ratio > 0.42 ? '#022232' : 'var(--eggshell)';
          } else {
            const alpha = Math.min(0.88, 0.12 + ratio * 0.76).toFixed(2);
            cellBg = `rgba(0, 60, 87, ${alpha})`;
            cellColor = ratio > 0.38 ? '#ffffff' : 'var(--yale-blue)';
          }
        }

        const diffVal = cellData.diff_from_expected !== undefined ? cellData.diff_from_expected : 0.0;
        const diffStr = diffVal >= 0 ? `+${diffVal}` : `${diffVal}`;
        const expVal = cellData.expected_picks !== undefined ? cellData.expected_picks : '—';

        html += `
          <td class="heatmap-cell" 
              data-sender="${sender}" 
              data-receiver="${receiver}" 
              style="background-color: ${cellBg}; color: ${cellColor};" 
              title="${sender} → ${receiver}: ${val} ${currentHeatmapMetric === 'weighted' ? 'closeness pts' : 'picks'} (Exp: ${expVal}, Diff: ${diffStr})">
            ${displayVal}
          </td>
        `;
      }
    });

    html += `</tr>`;
  });

  html += `
            </tbody>
          </table>
        </div>
      </div>
  `;

  container.innerHTML = html;
  attachHeatmapEvents(container, matrixObj);
}

function attachHeatmapEvents(container, matrixObj) {
  const table = container.querySelector('#heatmap-table');
  if (!table) return;

  // Cells and Row Headers mouseover
  table.addEventListener('mouseover', (e) => {
    // 1. Hovering over a cell
    const cell = e.target.closest('.heatmap-cell');
    if (cell && cell.dataset.sender && cell.dataset.receiver) {
      if (activeHeatmapHover && activeHeatmapHover.cell === cell) return;

      const sender = cell.dataset.sender;
      const receiver = cell.dataset.receiver;
      activeHeatmapHover = { sender, receiver, cell };

      // Highlight cell
      table.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('cell-hovered'));
      cell.classList.add('cell-hovered');

      // Highlight headers
      table.querySelectorAll('.heatmap-th-row').forEach(th => th.classList.remove('row-active'));
      table.querySelectorAll('.heatmap-th-col').forEach(th => th.classList.remove('col-active'));
      table.querySelector(`.heatmap-th-row[data-row="${sender}"]`)?.classList.add('row-active');
      table.querySelector(`.heatmap-th-col[data-col="${receiver}"]`)?.classList.add('col-active');

      const cellData = matrixObj.matrix[sender]?.[receiver] || { raw_count: 0, weighted_score: 0, avg_freedom_pct: 0, relationship: 'Colleague', emoji: '🤝' };
      updateHeatmapInspection({ sender, receiver, cellData });
      renderRosterForHeatmap(sender, receiver);
      return;
    }

    // 2. Hovering over a row header (Speaker name)
    const rowTh = e.target.closest('.heatmap-th-row');
    if (rowTh && rowTh.dataset.row) {
      const sender = rowTh.dataset.row;
      table.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('cell-hovered'));
      table.querySelectorAll('.heatmap-th-col').forEach(th => th.classList.remove('col-active'));
      table.querySelectorAll('.heatmap-th-row').forEach(th => {
        th.classList.toggle('row-active', th.dataset.row === sender);
      });
      activeHeatmapHover = null;
      updateHeatmapInspection(null, sender);
      renderRosterForHeatmap(sender, null);
    }
  });

  // Table mouseleave: restore selected sender view
  table.addEventListener('mouseleave', () => {
    table.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('cell-hovered'));
    table.querySelectorAll('.heatmap-th-col').forEach(th => th.classList.remove('col-active'));
    table.querySelectorAll('.heatmap-th-row').forEach(th => {
      th.classList.toggle('row-active', th.dataset.row === selectedHeatmapSender);
    });
    activeHeatmapHover = null;
    updateHeatmapInspection(null, selectedHeatmapSender);
    renderRosterForHeatmap(selectedHeatmapSender, null);
  });

  // Click on cell or row header -> lock selected sender and sync with dropdown
  table.addEventListener('click', (e) => {
    const cell = e.target.closest('.heatmap-cell');
    if (cell && cell.dataset.sender && cell.dataset.receiver) {
      selectedHeatmapSender = cell.dataset.sender;
      table.querySelectorAll('.heatmap-th-row').forEach(th => {
        th.classList.toggle('row-active', th.dataset.row === selectedHeatmapSender);
      });
      const profileSelect = document.getElementById('profile-select');
      if (profileSelect && profileSelect.value !== selectedHeatmapSender) {
        profileSelect.value = selectedHeatmapSender;
        renderPersonalProfile(selectedHeatmapSender);
      }
      renderRosterForHeatmap(selectedHeatmapSender, cell.dataset.receiver);
      return;
    }

    const rowTh = e.target.closest('.heatmap-th-row');
    if (rowTh && rowTh.dataset.row) {
      selectedHeatmapSender = rowTh.dataset.row;
      table.querySelectorAll('.heatmap-th-row').forEach(th => {
        th.classList.toggle('row-active', th.dataset.row === selectedHeatmapSender);
      });
      const profileSelect = document.getElementById('profile-select');
      if (profileSelect && profileSelect.value !== selectedHeatmapSender) {
        profileSelect.value = selectedHeatmapSender;
        renderPersonalProfile(selectedHeatmapSender);
      }
      updateHeatmapInspection(null, selectedHeatmapSender);
      renderRosterForHeatmap(selectedHeatmapSender, null);
    }
  });
}

// 8c. Section 2 View Switcher (Personal Closeness Index vs Team Heatmap)
function renderSection2View() {
  const personalView = document.getElementById('s2-personal-view');
  const heatmapView = document.getElementById('s2-heatmap-view');
  if (!personalView || !heatmapView) return;

  if (currentSection2View === 'personal') {
    personalView.style.display = 'block';
    heatmapView.style.display = 'none';
  } else {
    personalView.style.display = 'none';
    heatmapView.style.display = 'block';
    renderHeatmap();
    renderRosterForHeatmap(selectedHeatmapSender, null);
    updateHeatmapInspection(null, selectedHeatmapSender);
  }
}

let isWaveAnimating = false;

function toggleTheme() {
  if (isWaveAnimating) return;

  const targetTheme = currentTheme === 'light' ? 'dark' : 'light';
  console.log('Maritime wave automaton triggered -> target:', targetTheme);

  const updateThemeButtonLabel = () => {
    const themeLabel = document.getElementById('theme-btn-text');
    const text = currentTheme === 'light' ? 'Dark Mode' : 'Light Mode';
    if (themeLabel) {
      themeLabel.textContent = text;
    } else {
      const btn = document.getElementById('theme-toggle-btn');
      if (btn) btn.textContent = text;
    }
  };

  const waveOverlay = document.getElementById('maritime-wave-overlay');

  // Fallback only if overlay DOM element is missing
  if (!waveOverlay) {
    currentTheme = targetTheme;
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeButtonLabel();
    renderChart();
    if (currentSection2View === 'heatmap') {
      renderHeatmap();
    }
    drawSection3Graph();
    return;
  }

  isWaveAnimating = true;

  // Setup wave surge direction
  waveOverlay.classList.remove('to-dark', 'to-light', 'animating');
  waveOverlay.classList.add(targetTheme === 'dark' ? 'to-dark' : 'to-light');
  waveOverlay.classList.add('active');

  // Trigger reflow to restart CSS animation cleanly
  void waveOverlay.offsetWidth;
  waveOverlay.classList.add('animating');

  // Swap theme at peak flood (580ms) when the ocean body completely blankets the viewport
  setTimeout(() => {
    currentTheme = targetTheme;
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeButtonLabel();
    renderChart();
    if (currentSection2View === 'heatmap') {
      renderHeatmap();
    }
    drawSection3Graph();
  }, 580);

  // Clean up after wave recedes back down to bottom of screen (1260ms)
  setTimeout(() => {
    waveOverlay.classList.remove('active', 'animating', 'to-dark', 'to-light');
    isWaveAnimating = false;
  }, 1260);
}

window.toggleTheme = toggleTheme;

// 9. Event Listeners
function setupListeners() {
  // Theme Toggle Button
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // Section 1: View Tabs (scoped to #attendance-view-tabs)
  const tabBtns = document.querySelectorAll('#attendance-view-tabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentView = btn.dataset.view;
      renderChart();
    });
  });

  // Time Filter Links (scoped to #time-filter-links)
  const filterLinks = document.querySelectorAll('#time-filter-links .filter-link-btn');
  filterLinks.forEach(link => {
    link.addEventListener('click', () => {
      filterLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      currentFilter = link.dataset.filter;
      renderChart();
    });
  });

  // Heatmap Metric Toggle (Weighted Closeness vs Raw Counts)
  const heatmapToggleWeighted = document.getElementById('heatmap-toggle-weighted');
  const heatmapToggleRaw = document.getElementById('heatmap-toggle-raw');
  if (heatmapToggleWeighted && heatmapToggleRaw) {
    heatmapToggleWeighted.addEventListener('click', () => {
      if (currentHeatmapMetric === 'weighted') return;
      currentHeatmapMetric = 'weighted';
      heatmapToggleWeighted.classList.add('active');
      heatmapToggleRaw.classList.remove('active');
      renderHeatmap();
      renderRosterForHeatmap(selectedHeatmapSender, activeHeatmapHover ? activeHeatmapHover.receiver : null);
    });

    heatmapToggleRaw.addEventListener('click', () => {
      if (currentHeatmapMetric === 'raw') return;
      currentHeatmapMetric = 'raw';
      heatmapToggleRaw.classList.add('active');
      heatmapToggleWeighted.classList.remove('active');
      renderHeatmap();
      renderRosterForHeatmap(selectedHeatmapSender, activeHeatmapHover ? activeHeatmapHover.receiver : null);
    });
  }

  // Trendline Toggle (Instant 0ms toggle via dataset visibility)
  const trendlineToggle = document.getElementById('toggle-trendline');
  if (trendlineToggle) {
    trendlineToggle.addEventListener('change', (e) => {
      showTrendline = e.target.checked;
      const trendPill = document.getElementById('hud-trend-pill');
      if (trendPill) trendPill.style.display = showTrendline ? 'inline-flex' : 'none';
      if (currentView === 'timeline' && currentChart) {
        currentChart.setDatasetVisibility(1, showTrendline);
        currentChart.update('none');
      } else {
        renderChart();
      }
    });
  }

  // Milestones Toggle (Instant 0ms canvas redraw)
  const milestonesToggle = document.getElementById('toggle-milestones');
  if (milestonesToggle) {
    milestonesToggle.addEventListener('change', (e) => {
      showMilestones = e.target.checked;
      const milestoneEl = document.getElementById('hud-milestone');
      if (milestoneEl && lastInspectedRecord) {
        const milestone = (metricsData.team_milestones || []).find(m => m.date === lastInspectedRecord.date);
        milestoneEl.style.display = (milestone && showMilestones) ? 'inline-block' : 'none';
      }
      if (currentView === 'timeline' && currentChart) {
        currentChart.update('none');
      } else {
        renderChart();
      }
    });
  }

  // Section 2: View Navigation Tabs (Personal Closeness Index vs Nomination Heatmap)
  const s2TabBtns = document.querySelectorAll('.s2-nav-row .tab-btn');
  s2TabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      s2TabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentSection2View = btn.dataset.s2View;
      renderSection2View();
    });
  });

  // Section 2: Member Profile Selector
  const profileSelect = document.getElementById('profile-select');
  if (profileSelect) {
    profileSelect.addEventListener('change', (e) => {
      selectedHeatmapSender = e.target.value;
      renderPersonalProfile(e.target.value);
      if (currentSection2View === 'heatmap') {
        renderHeatmap();
        renderRosterForHeatmap(selectedHeatmapSender, null);
        updateHeatmapInspection(null, selectedHeatmapSender);
      }
    });
  }

  // Section 2: Nomination Sort Controls
  const sortPills = document.querySelectorAll('.picks-sort-pills .sort-btn');
  sortPills.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sortType = e.currentTarget.dataset.sort;
      if (sortType === currentNomineeSort) return;
      currentNomineeSort = sortType;
      sortPills.forEach(b => b.classList.toggle('active', b.dataset.sort === currentNomineeSort));
      const profileSelect = document.getElementById('profile-select');
      const curMember = profileSelect ? profileSelect.value : 'Leander';
      renderPersonalProfile(curMember);
    });
  });
}

// 10. SECTION 2: Render Personal Profiles
function renderPersonalProfile(memberName) {
  if (!metricsData || !metricsData.personal_profiles) return;

  const profile = metricsData.personal_profiles[memberName];
  if (!profile) return;

  // 1. Toolbar Metadata Tags
  const metaArchetype = document.getElementById('profile-meta-archetype');
  if (metaArchetype) metaArchetype.textContent = `✦ ${profile.archetype.title}`;

  const metaTenure = document.getElementById('profile-meta-tenure');
  if (metaTenure) {
    metaTenure.textContent = profile.is_day_1 ? 'Joined Day 1 (09/04/2025)' : `Joined ${profile.first_date}`;
  }

  const metaRank = document.getElementById('profile-meta-rank');
  if (metaRank) {
    metaRank.textContent = `Rank #${profile.rank} of ${profile.total_members}`;
  }

  // 2. Personal KPI Stat Strip
  const kpiAttended = document.getElementById('profile-kpi-attended');
  if (kpiAttended) {
    kpiAttended.innerHTML = `${profile.attended} <span class="stat-unit">/ ${profile.total_standups}</span>`;
  }
  const kpiAttendedSub = document.getElementById('profile-kpi-attended-sub');
  if (kpiAttendedSub) {
    kpiAttendedSub.textContent = profile.eligible_pct > profile.overall_pct
      ? `${profile.overall_pct}% overall (${profile.eligible_pct}% since joining)`
      : `${profile.overall_pct}% overall attendance`;
  }

  const kpiStreak = document.getElementById('profile-kpi-streak');
  if (kpiStreak) {
    kpiStreak.innerHTML = `${profile.max_streak} <span class="stat-unit">days</span>`;
  }
  const kpiStreakSub = document.getElementById('profile-kpi-streak-sub');
  if (kpiStreakSub) {
    kpiStreakSub.textContent = profile.streak_range;
  }

  const kpiSpeaking = document.getElementById('profile-kpi-speaking');
  if (kpiSpeaking) {
    kpiSpeaking.innerHTML = `${profile.p1_count} <span class="stat-unit">times</span>`;
  }
  const kpiSpeakingSub = document.getElementById('profile-kpi-speaking-sub');
  if (kpiSpeakingSub) {
    kpiSpeakingSub.textContent = `Avg position: ${profile.avg_pos} in lineup`;
  }

  const kpiPeakDay = document.getElementById('profile-kpi-peakday');
  if (kpiPeakDay) {
    kpiPeakDay.textContent = profile.peak_day.name;
  }
  const kpiPeakDaySub = document.getElementById('profile-kpi-peakday-sub');
  if (kpiPeakDaySub) {
    kpiPeakDaySub.textContent = `${profile.peak_day.pct}% turnout rate (${profile.peak_day.attended}/${profile.peak_day.total})`;
  }

  // 3. Monthly Attendance Trajectory (17-month punchcard matrix)
  const monthlyMatrixEl = document.getElementById('profile-monthly-matrix');
  if (monthlyMatrixEl && profile.monthly_trajectory) {
    monthlyMatrixEl.innerHTML = profile.monthly_trajectory.map(m => {
      const isPeakClass = m.is_peak ? 'peak-fill' : '';
      const barHeight = m.status === 'active' ? Math.max(m.pct, 3) : 0;
      const opacity = m.status === 'inactive' ? '0.2' : '1';
      const tooltip = m.status === 'active'
        ? `${m.month}: ${m.attended}/${m.total} (${m.pct}%)`
        : `${m.month}: Not yet joined`;

      return `
        <div class="month-col" title="${tooltip}">
          <span class="month-val">${m.status === 'active' ? m.pct + '%' : '—'}</span>
          <div class="month-bar-wrap" style="opacity: ${opacity}">
            <div class="month-bar-fill ${isPeakClass}" style="height: ${barHeight}%;"></div>
          </div>
          <span class="month-label">${m.label}</span>
        </div>
      `;
    }).join('');
  }

  // 4. Nomination Dynamics: Standup Closeness Index
  const picksGridEl = document.getElementById('profile-picks-grid');
  const picksStatsEl = document.getElementById('profile-picks-stats');
  const picksSubEl = document.getElementById('profile-picks-sub');

  if (picksSubEl) {
    picksSubEl.textContent = `Who ${profile.name} voluntarily calls on vs. who gets left for last across ${profile.attended} attended standups`;
  }

  const nb = profile.nomination_breakdown;
  if (nb && picksStatsEl && picksGridEl) {
    const topCrush = nb.top_crush || nb.top_weighted_pick;
    const archEnemy = nb.arch_enemy;
    const topR = nb.top_raw_pick;

    // Header summary badges (attendance-normalized)
    const crushDiff = topCrush && topCrush.diff_from_expected !== undefined ? (topCrush.diff_from_expected >= 0 ? `+${topCrush.diff_from_expected}` : `${topCrush.diff_from_expected}`) : '';
    const enemyDiff = archEnemy && archEnemy.diff_from_expected !== undefined ? (archEnemy.diff_from_expected >= 0 ? `+${archEnemy.diff_from_expected}` : `${archEnemy.diff_from_expected}`) : '';

    picksStatsEl.innerHTML = `
      <span class="picks-stat-badge">Total Picks: <strong>${nb.total_nominations}</strong></span>
      <span class="picks-stat-badge crush-badge" title="Highest attendance-normalized picks: favored ${crushDiff} picks above random baseline">
        💘 Office Crush: <strong>${topCrush ? topCrush.name : 'None'} (${crushDiff} vs exp)</strong>
      </span>
      <span class="picks-stat-badge enemy-badge" title="Most avoided relative to expected attendance: bypassed ${enemyDiff} picks below random baseline">
        ⚔️ Arch Enemy: <strong>${archEnemy ? archEnemy.name : 'None'} (${enemyDiff} vs exp)</strong>
      </span>
      <span class="picks-stat-badge" title="Most frequent raw nomination">
        Top Volume: <strong>${topR ? topR.name : 'None'} (${topR ? topR.raw_count : 0}x)</strong>
      </span>
    `;

    // Sort the list based on currentNomineeSort
    let sortedPicks = [...(nb.all_picks || [])];
    if (currentNomineeSort === 'weighted') {
      sortedPicks.sort((a, b) => (b.weighted_score - a.weighted_score) || (b.raw_count - a.raw_count));
    } else if (currentNomineeSort === 'raw') {
      sortedPicks.sort((a, b) => (b.raw_count - a.raw_count) || (b.weighted_score - a.weighted_score));
    } else if (currentNomineeSort === 'diff') {
      sortedPicks.sort((a, b) => (b.diff_from_expected - a.diff_from_expected) || (b.weighted_score - a.weighted_score));
    }

    if (sortedPicks.length > 0) {
      const maxRaw = Math.max(...sortedPicks.map(p => p.raw_count), 1);
      const topWeightedScore = topCrush ? topCrush.weighted_score : 0;
      const topRawCount = topR ? topR.raw_count : 0;

      picksGridEl.innerHTML = sortedPicks.map((p, idx) => {
        const isTopRaw = p.raw_count === topRawCount;
        const isTopWeighted = p.weighted_score === topWeightedScore;
        const diffVal = p.diff_from_expected !== undefined ? p.diff_from_expected : 0.0;
        const diffStr = diffVal >= 0 ? `+${diffVal}` : `${diffVal}`;
        const expVal = p.expected_picks !== undefined ? p.expected_picks : '—';

        // Scale both bars against maxRaw so closeness score visually reveals retained choice freedom
        const rawBarWidth = Math.max(Math.round((p.raw_count / maxRaw) * 100), 4);
        const weightedBarWidth = Math.max(Math.round((p.weighted_score / maxRaw) * 100), 2);

        const badgeKey = p.relationship_key || (p.category_key || p.category.toLowerCase().replace(/\s+/g, '-'));
        const badgeClass = `badge-${badgeKey}`;
        const emoji = p.relationship_emoji || p.emoji || '🤝';
        const badgeLabel = p.relationship || p.category || 'Colleague';
        const badgeTooltip = `${badgeLabel} (Exp: ${expVal}, Diff: ${diffStr}, ${p.weighted_score} closeness pts)`;

        return `
          <div class="pick-row">
            <span class="pick-rank">#${idx + 1}</span>
            <div class="pick-name-col">
              <span class="pick-name" title="${p.name}">${p.name}</span>
              <span class="freedom-badge ${badgeClass}" title="${badgeTooltip}">${emoji} ${badgeLabel}</span>
            </div>
            <div class="pick-dual-tracks">
              <div class="track-row" title="Raw Picks: ${p.raw_count} (${p.pct}% of total)">
                <div class="track-bar-fill raw-fill ${isTopRaw ? 'top-fill' : ''}" style="width: ${rawBarWidth}%;"></div>
              </div>
              <div class="track-row" title="Closeness Score: ${p.weighted_score} pts (Exp: ${expVal}, Diff: ${diffStr})">
                <div class="track-bar-fill weighted-fill ${isTopWeighted ? 'top-fill' : ''}" style="width: ${weightedBarWidth}%;"></div>
              </div>
            </div>
            <div class="pick-stats-col">
              <div class="stat-line raw-stat" title="Raw nominations">${p.raw_count}x <span class="stat-sub">(${p.pct}%)</span></div>
              <div class="stat-line weighted-stat" title="Closeness score: ${p.weighted_score} pts | Expected: ${expVal} | Diff: ${diffStr}">${p.weighted_score} <span class="stat-sub">(${diffStr})</span></div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      picksGridEl.innerHTML = `<div style="grid-column: 1 / -1; padding: 16px 0; font-size: 0.8rem; color: var(--text-dim); font-style: italic;">No nomination handoffs recorded.</div>`;
    }
  }
}

// ============================================================
// 10. SECTION 3: Mutual Chemistry & Bidirectional Network
// ============================================================

let s3Filter = 'top'; // 'top', 'positive', 'all'
let s3FocusMember = 'ALL';
let s3HoveredNode = null;
let s3HoveredEdge = null;
let s3SelectedDuo = null;
let s3NodePositions = {};
let s3CanvasCenter = { x: 300, y: 280 };
let s3Canvas = null;
let s3Ctx = null;

function initSection3() {
  if (!metricsData || !metricsData.mutual_connections) return;
  renderSection3Stats();
  populateSection3MemberFilter();
  renderSection3DuosList();
  initSection3Canvas();
  setupSection3Controls();
}

function renderSection3Stats() {
  const mc = metricsData.mutual_connections;
  if (!mc || !mc.summary) return;

  const topPair = mc.summary.top_pair;
  const balancedPair = mc.summary.most_balanced_pair;
  const unrequitedPair = mc.summary.most_unrequited_pair;
  const avgBalance = mc.summary.avg_team_balance;

  const topDuoEl = document.getElementById('s3-top-duo-names');
  const topDuoSub = document.getElementById('s3-top-duo-detail');
  if (topDuoEl && topPair) {
    topDuoEl.textContent = `${topPair.m1} & ${topPair.m2}`;
    topDuoSub.textContent = `+${topPair.diff_from_expected} vs exp (${topPair.total_picks} picks, ${topPair.balance_pct}% balance)`;
  }

  const balEl = document.getElementById('s3-balanced-names');
  const balSub = document.getElementById('s3-balanced-detail');
  if (balEl && balancedPair) {
    balEl.textContent = `${balancedPair.m1} & ${balancedPair.m2}`;
    balSub.textContent = `${balancedPair.balance_pct}% balance (${balancedPair.p12} vs ${balancedPair.p21} picks)`;
  }

  const unreqEl = document.getElementById('s3-unrequited-names');
  const unreqSub = document.getElementById('s3-unrequited-detail');
  if (unreqEl && unrequitedPair) {
    unreqEl.textContent = `${unrequitedPair.m1} & ${unrequitedPair.m2}`;
    const highGiver = unrequitedPair.p12 >= unrequitedPair.p21 ? unrequitedPair.m1 : unrequitedPair.m2;
    const lowGiver = unrequitedPair.p12 >= unrequitedPair.p21 ? unrequitedPair.m2 : unrequitedPair.m1;
    const hCount = Math.max(unrequitedPair.p12, unrequitedPair.p21);
    const lCount = Math.min(unrequitedPair.p12, unrequitedPair.p21);
    unreqSub.textContent = `${highGiver} (${hCount}) → ${lowGiver} (${lCount}) • ${unrequitedPair.balance_pct}% balance`;
  }

  const recEl = document.getElementById('s3-team-reciprocity');
  if (recEl) {
    recEl.textContent = `${avgBalance}%`;
  }
}

function populateSection3MemberFilter() {
  const select = document.getElementById('s3-member-select');
  if (!select) return;

  const members = metricsData.nomination_matrix?.members || allTeamMembers || [];
  select.innerHTML = `<option value="ALL">Entire Team (17)</option>` + 
    members.map(m => `<option value="${m}">${m}</option>`).join('');

  select.value = s3FocusMember;
  select.addEventListener('change', () => {
    s3FocusMember = select.value;
    s3SelectedDuo = null;
    drawSection3Graph();
    renderSection3DuosList();
    updateSection3Inspection();
  });
}

function setupSection3Controls() {
  const filterBtns = document.querySelectorAll('.s3-filter-group .filter-link-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      s3Filter = btn.dataset.s3Filter;
      s3SelectedDuo = null;
      drawSection3Graph();
      renderSection3DuosList();
      updateSection3Inspection();
    });
  });
}

function getFilteredPairs() {
  const mc = metricsData.mutual_connections;
  if (!mc) return [];

  let pairs = mc.pairs || [];
  if (s3FocusMember !== 'ALL') {
    pairs = pairs.filter(p => p.m1 === s3FocusMember || p.m2 === s3FocusMember);
  } else {
    if (s3Filter === 'top') {
      pairs = pairs.filter(p => p.diff_from_expected >= 5.0);
    } else if (s3Filter === 'positive') {
      pairs = pairs.filter(p => p.diff_from_expected > 0.0);
    }
  }
  return pairs;
}

function renderSection3DuosList() {
  const listEl = document.getElementById('s3-duos-list');
  const countEl = document.getElementById('s3-duos-count');
  const labelEl = document.getElementById('s3-sidebar-filter-label');
  if (!listEl) return;

  const filtered = getFilteredPairs();

  if (labelEl) {
    if (s3FocusMember !== 'ALL') {
      labelEl.textContent = `${s3FocusMember}'s Partners`;
    } else if (s3Filter === 'top') {
      labelEl.textContent = 'Top Duos (Δ ≥ +5)';
    } else if (s3Filter === 'positive') {
      labelEl.textContent = 'Favorites (Δ > 0)';
    } else {
      labelEl.textContent = 'All 136 Pairs';
    }
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} Pairs`;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<li style="padding: 16px; font-size: 0.76rem; color: var(--text-dim); text-align: center;">No pairs meet the active filter.</li>`;
    return;
  }

  listEl.innerHTML = filtered.map((p, idx) => {
    const isSelected = s3SelectedDuo && s3SelectedDuo.id === p.id;
    const diffStr = p.diff_from_expected >= 0 ? `+${p.diff_from_expected}` : `${p.diff_from_expected}`;
    const diffClass = p.diff_from_expected >= 5 ? 'positive' : (p.diff_from_expected >= 0 ? 'neutral' : '');
    const catClass = p.category === 'Dynamic Duo' ? 'cat-dynamic' : (p.category === 'Mutual Allies' ? 'cat-allies' : '');

    const p1Pct = p.total_picks > 0 ? Math.round((p.p12 / p.total_picks) * 100) : 50;
    const p2Pct = 100 - p1Pct;

    return `
      <li class="s3-duo-card ${isSelected ? 'card-active' : ''}" data-pair-id="${p.id}" title="${p.m1} & ${p.m2}: ${p.total_picks} mutual picks (Expected: ${p.total_expected}, Diff: ${diffStr})">
        <div class="s3-duo-top">
          <div class="s3-duo-names">
            <span class="s3-duo-rank">#${idx + 1}</span>
            <span>${p.m1} & ${p.m2}</span>
          </div>
          <span class="s3-duo-cat ${catClass}">${p.emoji} ${p.category}</span>
        </div>
        <div class="s3-duo-stats">
          <span>Actual: <strong>${p.total_picks}</strong> (Exp: ${p.total_expected})</span>
          <span class="s3-duo-diff ${diffClass}">Diff: ${diffStr}</span>
        </div>
        <div class="s3-balance-bar-wrap">
          <div class="s3-balance-labels">
            <span>${p.m1}: ${p.p12} (${p1Pct}%)</span>
            <span>${p.m2}: ${p.p21} (${p2Pct}%)</span>
          </div>
          <div class="s3-balance-bar">
            <div class="s3-balance-seg-left" style="width: ${p1Pct}%;"></div>
            <div class="s3-balance-seg-right" style="width: ${p2Pct}%;"></div>
          </div>
          <div class="s3-balance-pill">${p.balance_pct}% Reciprocal Balance</div>
        </div>
      </li>
    `;
  }).join('');

  // Attach card click & hover listeners
  listEl.querySelectorAll('.s3-duo-card').forEach(card => {
    const pairId = card.dataset.pairId;
    const pair = (metricsData.mutual_connections?.pairs || []).find(p => p.id === pairId);
    if (!pair) return;

    card.addEventListener('mouseenter', () => {
      s3HoveredEdge = pair;
      drawSection3Graph();
      updateSection3Inspection(null, pair);
    });

    card.addEventListener('mouseleave', () => {
      s3HoveredEdge = null;
      drawSection3Graph();
      updateSection3Inspection();
    });

    card.addEventListener('click', () => {
      s3SelectedDuo = (s3SelectedDuo && s3SelectedDuo.id === pair.id) ? null : pair;
      renderSection3DuosList();
      drawSection3Graph();
      updateSection3Inspection(null, s3SelectedDuo);
    });
  });
}

function updateSection3Inspection(hoveredNode, hoveredPair) {
  const container = document.getElementById('s3-inspection-content');
  if (!container) return;

  if (hoveredPair) {
    const diffStr = hoveredPair.diff_from_expected >= 0 ? `+${hoveredPair.diff_from_expected}` : `${hoveredPair.diff_from_expected}`;
    const diffColor = hoveredPair.diff_from_expected >= 0 ? PALETTE.strawberryRed : PALETTE.pacificBlue;
    container.innerHTML = `
      <span>
        <strong>${hoveredPair.m1} & ${hoveredPair.m2}</strong>: 
        <strong style="color: ${PALETTE.strawberryRed}; font-size: 0.90rem;">${hoveredPair.total_picks} mutual picks</strong> 
        (Expected co-attendance baseline: <strong>${hoveredPair.total_expected}</strong> • Diff: <strong style="color: ${diffColor};">${diffStr}</strong>). 
        Balance: <strong>${hoveredPair.balance_pct}%</strong> (${hoveredPair.m1}→${hoveredPair.m2}: ${hoveredPair.p12}, ${hoveredPair.m2}→${hoveredPair.m1}: ${hoveredPair.p21}) • 
        Category: <strong>${hoveredPair.emoji} ${hoveredPair.category}</strong>
      </span>
    `;
    return;
  }

  if (hoveredNode) {
    const memberPairs = metricsData.mutual_connections?.by_member?.[hoveredNode] || [];
    const topPartner = memberPairs[0];
    const topPartnerDiff = topPartner ? (topPartner.diff_from_expected >= 0 ? `+${topPartner.diff_from_expected}` : `${topPartner.diff_from_expected}`) : '—';
    const topPartnerName = topPartner ? (topPartner.m1 === hoveredNode ? topPartner.m2 : topPartner.m1) : 'None';
    container.innerHTML = `
      <span>
        <strong>${hoveredNode}'s Mutual Network</strong>: 
        Top mutual bond is with <strong>${topPartnerName}</strong> (${topPartnerDiff} picks above expected, ${topPartner?.total_picks || 0} total mutual passes). 
        Click node to isolate their reciprocal connections.
      </span>
    `;
    return;
  }

  if (s3FocusMember !== 'ALL') {
    const memberPairs = metricsData.mutual_connections?.by_member?.[s3FocusMember] || [];
    const topPartner = memberPairs[0];
    const topPartnerName = topPartner ? (topPartner.m1 === s3FocusMember ? topPartner.m2 : topPartner.m1) : 'None';
    container.innerHTML = `
      <span>
        <strong>Focused on ${s3FocusMember}</strong> • 
        Showing all reciprocal pairings. Top mutual partner is <strong>${topPartnerName}</strong>. 
        Click node or select 'Entire Team' to clear filter.
      </span>
    `;
    return;
  }

  container.innerHTML = `
    <span>
      <strong>Reciprocal Nomination Network</strong>: 
      Links represent mutual nominations between teammates. Line thickness & warmth reflect picks exceeding the co-attendance expected baseline. 
      Hover any member node or connection line to inspect their bidirectional metrics.
    </span>
  `;
}

function computeNodePositions(width, height) {
  const members = metricsData.nomination_matrix?.members || allTeamMembers || [];
  const N = members.length;
  if (N === 0) return;

  const cx = width / 2;
  const cy = height / 2;
  s3CanvasCenter = { x: cx, y: cy };
  const radius = Math.min(cx, cy) - 86;

  s3NodePositions = {};
  for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = cx + radius * cos;
    const y = cy + radius * sin;
    const m = members[i];
    const initials = m.slice(0, 2).toUpperCase();

    let labelX = x;
    let labelY = y;
    let textAlign = 'center';
    let textBaseline = 'middle';

    if (cos > 0.25) {
      textAlign = 'left';
      labelX = x + 20;
      labelY = y;
      textBaseline = 'middle';
    } else if (cos < -0.25) {
      textAlign = 'right';
      labelX = x - 20;
      labelY = y;
      textBaseline = 'middle';
    } else {
      textAlign = 'center';
      if (sin < 0) {
        labelY = y - 20;
        textBaseline = 'bottom';
      } else {
        labelY = y + 20;
        textBaseline = 'top';
      }
    }

    s3NodePositions[m] = {
      x, y, angle,
      name: m,
      initials,
      cos, sin,
      labelX, labelY,
      textAlign, textBaseline
    };
  }
}

function initSection3Canvas() {
  s3Canvas = document.getElementById('mutual-network-canvas');
  if (!s3Canvas) return;
  s3Ctx = s3Canvas.getContext('2d');

  function resizeCanvas() {
    const rect = s3Canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 600;
    const h = rect.height || 560;

    s3Canvas.width = w * dpr;
    s3Canvas.height = h * dpr;
    s3Ctx.resetTransform();
    s3Ctx.scale(dpr, dpr);
    computeNodePositions(w, h);
    drawSection3Graph();
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const tooltipEl = document.getElementById('s3-canvas-tooltip');

  s3Canvas.addEventListener('mousemove', (e) => {
    const rect = s3Canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let foundNode = null;
    for (const [member, pos] of Object.entries(s3NodePositions)) {
      if (Math.hypot(mx - pos.x, my - pos.y) <= 22) {
        foundNode = member;
        break;
      }
    }

    let foundEdge = null;
    if (!foundNode) {
      const filtered = getFilteredPairs();
      for (const pair of filtered) {
        const p1 = s3NodePositions[pair.m1];
        const p2 = s3NodePositions[pair.m2];
        if (!p1 || !p2) continue;

        const qx = (p1.x + p2.x) / 2 * 0.65 + s3CanvasCenter.x * 0.35;
        const qy = (p1.y + p2.y) / 2 * 0.65 + s3CanvasCenter.y * 0.35;

        for (let t = 0.1; t <= 0.9; t += 0.2) {
          const bx = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * qx + t * t * p2.x;
          const by = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * qy + t * t * p2.y;
          if (Math.hypot(mx - bx, my - by) <= 9) {
            foundEdge = pair;
            break;
          }
        }
        if (foundEdge) break;
      }
    }

    const changed = (foundNode !== s3HoveredNode || foundEdge !== s3HoveredEdge);
    s3HoveredNode = foundNode;
    s3HoveredEdge = foundEdge;

    if (s3HoveredNode || s3HoveredEdge) {
      s3Canvas.style.cursor = 'pointer';
    } else {
      s3Canvas.style.cursor = 'default';
    }

    if (changed) {
      drawSection3Graph();
      updateSection3Inspection(s3HoveredNode, s3HoveredEdge);
    }

    if (tooltipEl) {
      if (s3HoveredNode) {
        const pList = metricsData.mutual_connections?.by_member?.[s3HoveredNode] || [];
        const topP = pList[0];
        const topPartnerName = topP ? (topP.m1 === s3HoveredNode ? topP.m2 : topP.m1) : 'None';
        const topPartnerDiff = topP ? (topP.diff_from_expected >= 0 ? `+${topP.diff_from_expected}` : `${topP.diff_from_expected}`) : '—';
        tooltipEl.innerHTML = `
          <strong>${s3HoveredNode}</strong><br>
          Top Partner: <strong>${topPartnerName}</strong> (${topPartnerDiff})<br>
          <em style="color: var(--text-dim); font-size: 0.65rem;">Click to focus network</em>
        `;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = `${Math.min(mx + 12, rect.width - 200)}px`;
        tooltipEl.style.top = `${Math.min(my + 12, rect.height - 70)}px`;
      } else if (s3HoveredEdge) {
        const diffStr = s3HoveredEdge.diff_from_expected >= 0 ? `+${s3HoveredEdge.diff_from_expected}` : `${s3HoveredEdge.diff_from_expected}`;
        tooltipEl.innerHTML = `
          <strong>${s3HoveredEdge.m1} & ${s3HoveredEdge.m2}</strong><br>
          ${s3HoveredEdge.emoji} ${s3HoveredEdge.category}<br>
          Picks: <strong>${s3HoveredEdge.total_picks}</strong> (Diff: ${diffStr})<br>
          Balance: <strong>${s3HoveredEdge.balance_pct}%</strong>
        `;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = `${Math.min(mx + 12, rect.width - 200)}px`;
        tooltipEl.style.top = `${Math.min(my + 12, rect.height - 80)}px`;
      } else {
        tooltipEl.style.display = 'none';
      }
    }
  });

  s3Canvas.addEventListener('mouseleave', () => {
    s3HoveredNode = null;
    s3HoveredEdge = null;
    s3Canvas.style.cursor = 'default';
    if (tooltipEl) tooltipEl.style.display = 'none';
    drawSection3Graph();
    updateSection3Inspection();
  });

  s3Canvas.addEventListener('click', (e) => {
    const rect = s3Canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let clickedNode = null;
    for (const [member, pos] of Object.entries(s3NodePositions)) {
      if (Math.hypot(mx - pos.x, my - pos.y) <= 22) {
        clickedNode = member;
        break;
      }
    }

    if (clickedNode) {
      s3FocusMember = (s3FocusMember === clickedNode) ? 'ALL' : clickedNode;
      const select = document.getElementById('s3-member-select');
      if (select) select.value = s3FocusMember;
      s3SelectedDuo = null;
      drawSection3Graph();
      renderSection3DuosList();
      updateSection3Inspection();
      return;
    }

    if (!s3HoveredEdge) {
      if (s3FocusMember !== 'ALL' || s3SelectedDuo) {
        s3FocusMember = 'ALL';
        s3SelectedDuo = null;
        const select = document.getElementById('s3-member-select');
        if (select) select.value = 'ALL';
        drawSection3Graph();
        renderSection3DuosList();
        updateSection3Inspection();
      }
    }
  });
}

function drawSection3Graph() {
  if (!s3Canvas || !s3Ctx) return;
  const rect = s3Canvas.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 560;
  const isDark = currentTheme === 'dark';

  s3Ctx.clearRect(0, 0, width, height);

  const filteredPairs = getFilteredPairs();
  const activeFocus = s3FocusMember !== 'ALL' ? s3FocusMember : null;
  const activeHover = s3HoveredNode || null;
  const activeEdge = s3HoveredEdge || s3SelectedDuo || null;

  // 1. Draw Edges
  for (const pair of filteredPairs) {
    const p1 = s3NodePositions[pair.m1];
    const p2 = s3NodePositions[pair.m2];
    if (!p1 || !p2) continue;

    const includesFocus = activeFocus ? (pair.m1 === activeFocus || pair.m2 === activeFocus) : true;
    const includesHoverNode = activeHover ? (pair.m1 === activeHover || pair.m2 === activeHover) : true;
    const isHoveredEdge = activeEdge ? (pair.id === activeEdge.id) : false;

    let isHighlighted = false;
    let alpha = 0.55;

    if (activeEdge) {
      if (isHoveredEdge) {
        isHighlighted = true;
        alpha = 0.95;
      } else {
        alpha = 0.05;
      }
    } else if (activeHover) {
      if (includesHoverNode) {
        isHighlighted = true;
        alpha = 0.92;
      } else {
        alpha = 0.05;
      }
    } else if (activeFocus) {
      if (includesFocus) {
        isHighlighted = true;
        alpha = 0.88;
      } else {
        alpha = 0.04;
      }
    }

    const qx = (p1.x + p2.x) / 2 * 0.65 + s3CanvasCenter.x * 0.35;
    const qy = (p1.y + p2.y) / 2 * 0.65 + s3CanvasCenter.y * 0.35;

    const baseW = Math.max(1.2, Math.min(6.0, 1.2 + (pair.diff_from_expected / 28.0) * 4.5));
    const lineWidth = isHighlighted ? (baseW + 2.0) : baseW;

    let strokeColor;
    if (pair.diff_from_expected >= 12.0) {
      strokeColor = `rgba(232, 63, 64, ${alpha})`;
    } else if (pair.diff_from_expected >= 6.0) {
      strokeColor = `rgba(217, 119, 6, ${alpha})`;
    } else if (pair.diff_from_expected >= 0.0) {
      strokeColor = isDark ? `rgba(67, 188, 205, ${alpha})` : `rgba(0, 60, 87, ${alpha})`;
    } else {
      strokeColor = isDark ? `rgba(244, 237, 219, ${alpha * 0.4})` : `rgba(0, 0, 0, ${alpha * 0.25})`;
    }

    s3Ctx.beginPath();
    s3Ctx.moveTo(p1.x, p1.y);
    s3Ctx.quadraticCurveTo(qx, qy, p2.x, p2.y);
    s3Ctx.strokeStyle = strokeColor;
    s3Ctx.lineWidth = lineWidth;
    if (pair.diff_from_expected < 0) {
      s3Ctx.setLineDash([3, 4]);
    } else {
      s3Ctx.setLineDash([]);
    }
    s3Ctx.stroke();
    s3Ctx.setLineDash([]);
  }

  // 2. Draw Nodes
  for (const [member, pos] of Object.entries(s3NodePositions)) {
    const isFocused = (member === activeFocus);
    const isHovered = (member === activeHover);
    const isConnectedToHover = activeHover ? (filteredPairs.some(p => (p.m1 === member && p.m2 === activeHover) || (p.m2 === member && p.m1 === activeHover))) : false;
    const isConnectedToEdge = activeEdge ? (member === activeEdge.m1 || member === activeEdge.m2) : false;

    let nodeRadius = (isHovered || isFocused || isConnectedToEdge) ? 19 : 15;
    let nodeBg;
    let nodeBorder;
    let textColor;

    if (isHovered || isFocused || isConnectedToEdge) {
      nodeBg = PALETTE.strawberryRed;
      nodeBorder = isDark ? '#ffffff' : '#003c57';
      textColor = '#ffffff';
    } else if (activeHover && !isConnectedToHover) {
      nodeBg = isDark ? 'rgba(244, 237, 219, 0.08)' : 'rgba(0, 60, 87, 0.06)';
      nodeBorder = 'transparent';
      textColor = 'var(--text-dim)';
    } else {
      nodeBg = isDark ? '#1a2e3b' : '#f4eddb';
      nodeBorder = isDark ? '#43bccd' : '#003c57';
      textColor = isDark ? '#f4eddb' : '#003c57';
    }

    s3Ctx.beginPath();
    s3Ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
    s3Ctx.fillStyle = nodeBg;
    s3Ctx.fill();
    s3Ctx.lineWidth = (isHovered || isFocused || isConnectedToEdge) ? 2.5 : 1.5;
    s3Ctx.strokeStyle = nodeBorder;
    s3Ctx.stroke();

    s3Ctx.font = `700 ${nodeRadius > 16 ? '11px' : '9.5px'} ${FONT_MONO}`;
    s3Ctx.textAlign = 'center';
    s3Ctx.textBaseline = 'middle';
    s3Ctx.fillStyle = textColor;
    s3Ctx.fillText(pos.initials, pos.x, pos.y);

    let labelColor;
    if (isHovered || isFocused || isConnectedToEdge) {
      labelColor = PALETTE.strawberryRed;
      s3Ctx.font = `700 12px ${FONT_SANS}`;
    } else if (activeHover && !isConnectedToHover) {
      labelColor = isDark ? 'rgba(244, 237, 219, 0.25)' : 'rgba(0, 0, 0, 0.25)';
      s3Ctx.font = `500 10.5px ${FONT_SANS}`;
    } else {
      labelColor = isDark ? '#f4eddb' : '#003c57';
      s3Ctx.font = `600 11px ${FONT_SANS}`;
    }

    s3Ctx.textAlign = pos.textAlign;
    s3Ctx.textBaseline = pos.textBaseline;
    s3Ctx.fillStyle = labelColor;
    s3Ctx.fillText(pos.name, pos.labelX, pos.labelY);
  }
}

// ==========================================
// 11. SECTION 4: Teacher's Pet Dynamics
// ==========================================

let currentS4View = 'leaderboard'; // 'leaderboard', 'comparison', 'timing'
let currentS4Target = 'either'; // 'either', 'will', 'luke'
let selectedS4Member = 'Freya';

function initSection4() {
  const tp = metricsData.teachers_pet;
  if (!tp) return;

  renderSection4KPIs();
  setupSection4Tabs();
  setupSection4Controls();
  renderSection4Leaderboard();
  renderSection4Inspector(selectedS4Member);
  renderSection4Comparison();
  renderSection4Timing();
}

function renderSection4KPIs() {
  const tp = metricsData.teachers_pet;
  if (!tp || !tp.summary) return;

  const summary = tp.summary;
  const topPet = summary.top_pet;
  const topAffinity = summary.top_opportunity_affinity;
  const rebel = summary.class_rebel;

  const totalEl = document.getElementById('s4-kpi-total');
  const totalSub = document.getElementById('s4-kpi-total-sub');
  if (totalEl) {
    totalEl.innerHTML = `${summary.total_teacher_picks} <span class="stat-unit">nominations</span>`;
  }
  if (totalSub) {
    totalSub.textContent = `187 for Will • 172 for Luke`;
  }

  const petEl = document.getElementById('s4-kpi-top-pet');
  const petSub = document.getElementById('s4-kpi-top-pet-sub');
  if (petEl && topPet) {
    petEl.innerHTML = `${topPet.name} <span class="stat-unit">(+${topPet.diff_total})</span>`;
  }
  if (petSub && topPet) {
    petSub.textContent = `${topPet.raw_total} picks • ${topPet.conversion_rate}% conversion`;
  }

  const affEl = document.getElementById('s4-kpi-top-affinity');
  const affSub = document.getElementById('s4-kpi-top-affinity-sub');
  if (affEl && topAffinity) {
    affEl.innerHTML = `${topAffinity.name} <span class="stat-unit">(${topAffinity.ratio_vs_expected}x)</span>`;
  }
  if (affSub && topAffinity) {
    affSub.textContent = `${topAffinity.avg_freedom_pct}% early freedom score`;
  }

  const rebelEl = document.getElementById('s4-kpi-rebel');
  const rebelSub = document.getElementById('s4-kpi-rebel-sub');
  if (rebelEl && rebel) {
    rebelEl.innerHTML = `${rebel.name} <span class="stat-unit">(${rebel.diff_total})</span>`;
  }
  if (rebelSub && rebel) {
    rebelSub.textContent = `Only ${rebel.conversion_rate}% conversion in ${rebel.opps_either} opps`;
  }
}

function setupSection4Tabs() {
  const tabs = [
    { id: 'btn-s4-leaderboard', view: 'leaderboard', panelId: 's4-view-leaderboard' },
    { id: 'btn-s4-comparison', view: 'comparison', panelId: 's4-view-comparison' },
    { id: 'btn-s4-timing', view: 'timing', panelId: 's4-view-timing' }
  ];

  tabs.forEach(t => {
    const btn = document.getElementById(t.id);
    if (!btn) return;

    btn.addEventListener('click', () => {
      currentS4View = t.view;

      tabs.forEach(other => {
        const otherBtn = document.getElementById(other.id);
        const otherPanel = document.getElementById(other.panelId);
        if (otherBtn) {
          otherBtn.classList.toggle('active', other.view === currentS4View);
          otherBtn.setAttribute('aria-selected', other.view === currentS4View);
        }
        if (otherPanel) {
          otherPanel.style.display = other.view === currentS4View ? 'block' : 'none';
        }
      });
    });
  });
}

function setupSection4Controls() {
  // Target Filters
  const targetBtns = [
    { id: 's4-target-either', target: 'either' },
    { id: 's4-target-will', target: 'will' },
    { id: 's4-target-luke', target: 'luke' }
  ];

  targetBtns.forEach(b => {
    const el = document.getElementById(b.id);
    if (!el) return;
    el.addEventListener('click', () => {
      currentS4Target = b.target;
      targetBtns.forEach(o => {
        const oEl = document.getElementById(o.id);
        if (oEl) oEl.classList.toggle('active', o.target === currentS4Target);
      });
      const targetLabel = document.getElementById('s4-inspector-target-label');
      if (targetLabel) {
        targetLabel.textContent = `Target: ${currentS4Target === 'either' ? 'Both' : (currentS4Target === 'will' ? 'Will' : 'Luke')}`;
      }
      renderSection4Leaderboard();
      renderSection4Inspector(selectedS4Member);
    });
  });
}

function renderSection4Leaderboard() {
  const container = document.getElementById('s4-rows-wrap');
  if (!container) return;

  const rawList = metricsData.teachers_pet?.leaderboard || [];
  // Clone to sort
  const list = rawList.map(m => {
    let picks, expected, diff, rate, opps;
    if (currentS4Target === 'will') {
      picks = m.raw_will;
      expected = m.expected_will;
      diff = m.diff_will;
      rate = m.rate_will;
      opps = m.opps_will;
    } else if (currentS4Target === 'luke') {
      picks = m.raw_luke;
      expected = m.expected_luke;
      diff = m.diff_luke;
      rate = m.rate_luke;
      opps = m.opps_luke;
    } else {
      picks = m.raw_total;
      expected = m.expected_total;
      diff = m.diff_total;
      rate = m.conversion_rate;
      opps = m.opps_either;
    }
    return { ...m, activePicks: picks, activeExp: expected, activeDiff: diff, activeRate: rate, activeOpps: opps };
  });

  // Order strictly by Actual vs. Expected (diff descending)
  list.sort((a, b) => {
    // Teachers go last in rank comparisons
    if (a.is_teacher !== b.is_teacher) {
      return a.is_teacher ? 1 : -1;
    }
    return b.activeDiff - a.activeDiff || b.weighted_total - a.weighted_total;
  });

  container.innerHTML = list.map((item, idx) => {
    const isTeacher = item.is_teacher;
    const rankNum = isTeacher ? '★' : `#${idx + 1}`;
    const isActive = item.name === selectedS4Member;
    const diffStr = item.activeDiff > 0 ? `+${item.activeDiff}` : `${item.activeDiff}`;
    const diffClass = item.activeDiff > 0 ? 'delta-pos' : 'delta-neg';
    const rateBarWidth = Math.min(100, Math.max(0, item.activeRate * 2.8));
    const isHighAffinity = item.activeDiff >= 1.5;

    let favClass = 'fav-balanced';
    if (item.favorite_teacher === 'Luke') favClass = 'fav-luke';
    else if (item.favorite_teacher === 'Will') favClass = 'fav-will';

    return `
      <div class="s4-member-row ${isActive ? 'row-active' : ''} ${isTeacher ? 'is-faculty' : ''}" data-member="${item.name}">
        <span class="s4-col-rank">${rankNum}</span>
        <div class="s4-col-name">
          <span class="s4-name-text">${item.name}</span>
          <span class="s4-badge-tag">${item.badge}</span>
        </div>
        <span class="s4-col-opps">${item.activeOpps} opps</span>
        <div class="s4-col-picks">
          <strong>${item.activePicks}</strong> / ${item.activeExp}
          <span class="s4-delta-pill ${diffClass}">${diffStr}</span>
        </div>
        <div class="s4-col-rate">
          <span>${item.activeRate}%</span>
          <div class="s4-mini-rate-bar">
            <div class="s4-mini-rate-fill ${isHighAffinity ? 'high-affinity' : ''}" style="width: ${rateBarWidth}%;"></div>
          </div>
        </div>
        <span class="s4-col-freedom">${item.avg_freedom_pct}%</span>
        <span class="s4-col-fav ${favClass}">${item.favorite_teacher}</span>
      </div>
    `;
  }).join('');

  // Row click listeners
  container.querySelectorAll('.s4-member-row').forEach(row => {
    row.addEventListener('click', () => {
      const name = row.dataset.member;
      selectedS4Member = name;

      container.querySelectorAll('.s4-member-row').forEach(r => {
        r.classList.toggle('row-active', r.dataset.member === selectedS4Member);
      });

      renderSection4Inspector(selectedS4Member);
      updateSection4Inspection(selectedS4Member);
    });
  });
}

function renderSection4Inspector(memberName) {
  const container = document.getElementById('s4-inspector-body');
  if (!container) return;

  const members = metricsData.teachers_pet?.members || [];
  const m = members.find(p => p.name === memberName) || members[0];
  if (!m) return;

  const diffStr = m.diff_total > 0 ? `+${m.diff_total}` : `${m.diff_total}`;
  const diffClass = m.diff_total > 0 ? 'delta-pos' : 'delta-neg';
  const totalTurns = (m.early_picks + m.mid_picks + m.late_picks) || 1;
  const earlyPct = Math.round((m.early_picks / totalTurns) * 100);
  const midPct = Math.round((m.mid_picks / totalTurns) * 100);
  const latePct = Math.round((m.late_picks / totalTurns) * 100);

  container.innerHTML = `
    <div class="s4-inspector-card">
      <div class="s4-insp-name-row">
        <div>
          <div class="s4-insp-name">${m.name}</div>
          <div class="s4-insp-badge">${m.badge}</div>
        </div>
        <span class="s4-insp-rank-pill">${m.is_teacher ? 'Faculty' : `Rank #${m.rank || '—'}`}</span>
      </div>

      <div class="s4-insp-desc">
        ${m.description}
      </div>

      <div class="s4-insp-stats-grid">
        <div class="s4-insp-stat-item">
          <span class="s4-insp-stat-lbl">Active Opportunities</span>
          <span class="s4-insp-stat-val">${m.opps_either} <small style="font-size:0.65rem; color:var(--text-dim);">days</small></span>
        </div>
        <div class="s4-insp-stat-item">
          <span class="s4-insp-stat-lbl">Affinity vs. Expected</span>
          <span class="s4-insp-stat-val ${m.diff_total > 0 ? 'highlight-red' : ''}">${diffStr}</span>
        </div>
        <div class="s4-insp-stat-item">
          <span class="s4-insp-stat-lbl">Conversion Rate</span>
          <span class="s4-insp-stat-val highlight-blue">${m.conversion_rate}%</span>
        </div>
        <div class="s4-insp-stat-item">
          <span class="s4-insp-stat-lbl">Early Freedom Score</span>
          <span class="s4-insp-stat-val">${m.avg_freedom_pct}%</span>
        </div>
      </div>

      <div class="s4-insp-dual-breakdown">
        <span class="s4-insp-dual-header">Leadership Breakdown</span>
        <div class="s4-insp-dual-row">
          <span>Will (${m.opps_will} opps):</span>
          <strong>${m.raw_will} picks (${m.diff_will > 0 ? '+' : ''}${m.diff_will} vs exp)</strong>
        </div>
        <div class="s4-insp-dual-row">
          <span>Luke (${m.opps_luke} opps):</span>
          <strong>${m.raw_luke} picks (${m.diff_luke > 0 ? '+' : ''}${m.diff_luke} vs exp)</strong>
        </div>
      </div>

      <div class="s4-insp-timing-bar-wrap">
        <div class="s4-insp-timing-label">
          <span>Speaking Turn Position</span>
          <span>Early: ${m.early_picks} • Mid: ${m.mid_picks} • Late: ${m.late_picks}</span>
        </div>
        <div class="s4-insp-timing-bar">
          <div class="s4-time-early" style="width: ${earlyPct}%;" title="Early voluntary picks: ${m.early_picks}"></div>
          <div class="s4-time-mid" style="width: ${midPct}%;" title="Mid turns: ${m.mid_picks}"></div>
          <div class="s4-time-late" style="width: ${latePct}%;" title="Late forced turns: ${m.late_picks}"></div>
        </div>
      </div>
    </div>
  `;
}

function renderSection4Comparison() {
  const container = document.getElementById('s4-comparison-grid');
  if (!container) return;

  const members = (metricsData.teachers_pet?.members || []).filter(m => !m.is_teacher);
  const willCamp = [...members].sort((a, b) => b.diff_will - a.diff_will).slice(0, 5);
  const lukeCamp = [...members].sort((a, b) => b.diff_luke - a.diff_luke).slice(0, 5);
  const mutualFaculty = metricsData.teachers_pet?.summary?.mutual_faculty || { will_to_luke: 12, luke_to_will: 13 };

  container.innerHTML = `
    <!-- Will's Camp -->
    <div class="s4-camp-card will-camp">
      <div>
        <div class="s4-camp-title">Will's Top Enthusiasts</div>
        <div class="s4-camp-sub">Highest intentionality & voluntary baton handoffs for Will</div>
      </div>
      <ul class="s4-camp-list">
        ${willCamp.map(m => `
          <li class="s4-camp-item">
            <div>
              <strong>${m.name}</strong> 
              <small style="color:var(--text-dim); margin-left:4px;">${m.badge}</small>
            </div>
            <div>
              <strong style="color:var(--strawberry-red);">${m.raw_will} picks</strong> 
              <span class="s4-delta-pill ${m.diff_will > 0 ? 'delta-pos' : 'delta-neg'}">${m.diff_will > 0 ? '+' : ''}${m.diff_will}</span>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>

    <!-- Faculty Mutual Alliance -->
    <div class="s4-camp-card faculty-camp">
      <div>
        <div class="s4-camp-title">Faculty Alliance</div>
        <div class="s4-camp-sub">Mutual handoffs between the leadership pair</div>
      </div>
      <div style="padding: 12px 6px; display: flex; flex-direction: column; gap: 12px; text-align: center;">
        <div style="display: flex; justify-content: space-around; align-items: center;">
          <div style="display:flex; flex-direction:column; align-items:center;">
            <strong style="font-size: 1.15rem; color: var(--text-main);">Will</strong>
            <span style="font-size: 0.72rem; color: var(--text-dim);">Speaker #1 in 29 standups</span>
          </div>
          <div style="font-size: 1.4rem; color: var(--pacific-blue);">⇄</div>
          <div style="display:flex; flex-direction:column; align-items:center;">
            <strong style="font-size: 1.15rem; color: var(--text-main);">Luke</strong>
            <span style="font-size: 0.72rem; color: var(--text-dim);">Present in 190 standups</span>
          </div>
        </div>

        <div style="background: rgba(0, 60, 87, 0.04); padding: 8px; border-radius: 2px; font-family: var(--font-mono); font-size: 0.76rem;">
          <div>Will → Luke: <strong>${mutualFaculty.will_to_luke} picks</strong> (+1.7 vs exp)</div>
          <div style="margin-top: 4px;">Luke → Will: <strong>${mutualFaculty.luke_to_will} picks</strong> (-1.1 vs exp)</div>
        </div>

        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin: 0;">
          Will and Luke have exchanged <strong>25 mutual picks</strong> across the season, maintaining a balanced <strong>96% reciprocity alignment</strong>.
        </p>
      </div>
    </div>

    <!-- Luke's Camp -->
    <div class="s4-camp-card luke-camp">
      <div>
        <div class="s4-camp-title">Luke's Top Loyalists</div>
        <div class="s4-camp-sub">Highest intentionality & voluntary baton handoffs for Luke</div>
      </div>
      <ul class="s4-camp-list">
        ${lukeCamp.map(m => `
          <li class="s4-camp-item">
            <div>
              <strong>${m.name}</strong> 
              <small style="color:var(--text-dim); margin-left:4px;">${m.badge}</small>
            </div>
            <div>
              <strong style="color:var(--pacific-blue);">${m.raw_luke} picks</strong> 
              <span class="s4-delta-pill ${m.diff_luke > 0 ? 'delta-pos' : 'delta-neg'}">${m.diff_luke > 0 ? '+' : ''}${m.diff_luke}</span>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderSection4Timing() {
  const container = document.getElementById('s4-timing-wrap');
  if (!container) return;

  const members = (metricsData.teachers_pet?.members || []).filter(m => !m.is_teacher);
  // Sort by early freedom score descending
  const sorted = [...members].sort((a, b) => b.avg_freedom_pct - a.avg_freedom_pct);

  container.innerHTML = `
    <div class="s4-timing-legend">
      <div class="s4-timing-legend-item">
        <span class="s4-legend-dot" style="background: var(--strawberry-red);"></span>
        <span>Early Turns (Turns 1–3, High Voluntary Freedom)</span>
      </div>
      <div class="s4-timing-legend-item">
        <span class="s4-legend-dot" style="background: var(--pacific-blue);"></span>
        <span>Mid Turns (Turns 4–7)</span>
      </div>
      <div class="s4-timing-legend-item">
        <span class="s4-legend-dot" style="background: var(--text-dim);"></span>
        <span>Late Turns (Turns 8+, Low Freedom / Forced Pick)</span>
      </div>
    </div>

    <div style="display:flex; flex-direction:column; gap:6px;">
      ${sorted.map(m => {
        const total = (m.early_picks + m.mid_picks + m.late_picks) || 1;
        const ePct = Math.round((m.early_picks / total) * 100);
        const mPct = Math.round((m.mid_picks / total) * 100);
        const lPct = Math.round((m.late_picks / total) * 100);

        return `
          <div class="s4-timing-row">
            <div>
              <span class="s4-timing-name">${m.name}</span>
              <div style="font-family:var(--font-mono); font-size:0.64rem; color:var(--text-dim);">${m.avg_freedom_pct}% avg freedom</div>
            </div>
            <div class="s4-timing-stacked-bar">
              <div class="s4-time-early" style="width: ${ePct}%;" title="Early: ${m.early_picks}"></div>
              <div class="s4-time-mid" style="width: ${mPct}%;" title="Mid: ${m.mid_picks}"></div>
              <div class="s4-time-late" style="width: ${lPct}%;" title="Late: ${m.late_picks}"></div>
            </div>
            <div class="s4-timing-stats">
              <strong>${m.raw_total}</strong> picks <small>(${m.early_picks} early)</small>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateSection4Inspection(memberName) {
  const container = document.getElementById('s4-inspection-content');
  if (!container) return;

  const members = metricsData.teachers_pet?.members || [];
  const m = members.find(p => p.name === memberName);
  if (!m) return;

  const diffStr = m.diff_total > 0 ? `+${m.diff_total}` : `${m.diff_total}`;
  const diffColor = m.diff_total > 0 ? PALETTE.strawberryRed : PALETTE.pacificBlue;

  container.innerHTML = `
    <span>
      <strong>${m.name} (${m.badge})</strong>: 
      Called on Will or Luke <strong style="color:${diffColor}; font-size:0.92rem;">${m.raw_total} times</strong> 
      (Expected baseline: <strong>${m.expected_total}</strong> • Diff: <strong style="color:${diffColor};">${diffStr}</strong>). 
      Converted <strong>${m.conversion_rate}%</strong> of all ${m.opps_either} opportunities with an average speaking turn freedom of <strong>${m.avg_freedom_pct}%</strong>. 
      Favorite leadership handoff: <strong>${m.favorite_teacher}</strong> (${m.raw_will} for Will, ${m.raw_luke} for Luke).
    </span>
  `;
}

// ==========================================================================
// SECTION 5: Recurring Baton Chains, Grouped Corridors & Speaking Groups
// ==========================================================================
let s5ActiveTab = 'clusters'; // 'clusters', 'grouped', 'frequent', 'longest'
let s5FilterLength = 'all'; // 'all', '3', '4', '5+'
let s5FilterMember = 'all';
let s5FilterDedup = 'maximal';
let s5CurrentPage = 1;
let s5GroupedCurrentPage = 1;
let s5ClustersCurrentPage = 1;
const S5_PAGE_SIZE = 20;
let s5SelectedChain = null;
let s5SelectedGroupedChain = null;
let s5SelectedCluster = null;

function initSection5() {
  const rc = metricsData.recurring_chains;
  if (!rc) return;

  // 1. Populate KPI strip
  const topClusterEl = document.getElementById('s5-kpi-top-cluster');
  const topClusterSubEl = document.getElementById('s5-kpi-top-cluster-sub');
  const topGroupedEl = document.getElementById('s5-kpi-top-grouped');
  const topGroupedSubEl = document.getElementById('s5-kpi-top-grouped-sub');
  const topChainEl = document.getElementById('s5-kpi-top-chain');
  const topChainSubEl = document.getElementById('s5-kpi-top-chain-sub');
  const longestRunEl = document.getElementById('s5-kpi-longest-run');
  const longestRunSubEl = document.getElementById('s5-kpi-longest-run-sub');

  if (topClusterEl && rc.summary.top_cluster) {
    const tc = rc.summary.top_cluster;
    topClusterEl.innerHTML = `${tc.total_count} <span class="stat-unit">times</span>`;
    topClusterSubEl.textContent = `${tc.members.join(' & ')} (${tc.distinct_orders_count} orders)`;
  }

  if (topGroupedEl && rc.summary.top_grouped_chain) {
    const tg = rc.summary.top_grouped_chain;
    topGroupedEl.innerHTML = `${tg.total_count} <span class="stat-unit">times</span>`;
    topGroupedSubEl.textContent = `${tg.members.join(' ⇄ ')} (${tg.fwd_count} fwd • ${tg.rev_count} rev)`;
  }

  if (topChainEl && rc.summary.top_trio) {
    topChainEl.innerHTML = `${rc.summary.top_trio.count} <span class="stat-unit">times</span>`;
    topChainSubEl.textContent = rc.summary.top_trio.members.join(' → ');
  }

  if (longestRunEl && rc.summary.max_length) {
    longestRunEl.innerHTML = `${rc.summary.max_length} <span class="stat-unit">members</span>`;
    const rec = rc.summary.record_run;
    if (rec) {
      longestRunSubEl.textContent = `${rec.members[0]} → … → ${rec.members[rec.members.length - 1]} (${rec.count}x repeated)`;
    } else {
      longestRunSubEl.textContent = `Longest unbroken run`;
    }
  }

  // Header badges
  const bCluster = document.getElementById('s5-badge-cluster-count');
  const bGrouped = document.getElementById('s5-badge-grouped-count');
  const bDirectional = document.getElementById('s5-badge-directional-count');
  if (bCluster) bCluster.textContent = `${(rc.summary.total_clusters || 2849).toLocaleString()} Clusters`;
  if (bGrouped) bGrouped.textContent = `${(rc.summary.total_grouped_chains || 975).toLocaleString()} Reversible Corridors`;
  if (bDirectional) bDirectional.textContent = `${(rc.summary.total_chains || 847).toLocaleString()} Directional Chains`;

  // 2. Teammate Focus Dropdown
  const memberSelect = document.getElementById('s5-filter-member');
  if (memberSelect) {
    const members = (allTeamMembers && allTeamMembers.length > 0) ? allTeamMembers : (metricsData.attendance_by_person || []).map(p => p.name);
    memberSelect.innerHTML = `<option value="all" selected>Entire Team (All)</option>` + 
      members.map(m => `<option value="${m}">${m}</option>`).join('');

    memberSelect.addEventListener('change', () => {
      s5FilterMember = memberSelect.value;
      s5CurrentPage = 1;
      s5GroupedCurrentPage = 1;
      s5ClustersCurrentPage = 1;
      renderActiveSection5View();
    });
  }

  // 3. Length filter buttons
  const lenBtns = document.querySelectorAll('.s5-toolbar [data-s5-length]');
  lenBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      lenBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      s5FilterLength = btn.dataset.s5Length;
      s5CurrentPage = 1;
      s5GroupedCurrentPage = 1;
      s5ClustersCurrentPage = 1;
      renderActiveSection5View();
    });
  });

  // 4. Scope / Dedup select
  const dedupSelect = document.getElementById('s5-filter-dedup');
  if (dedupSelect) {
    dedupSelect.addEventListener('change', () => {
      s5FilterDedup = dedupSelect.value;
      s5CurrentPage = 1;
      s5GroupedCurrentPage = 1;
      s5ClustersCurrentPage = 1;
      renderActiveSection5View();
    });
  }

  // 5. Navigation Tab buttons
  const tabBtns = document.querySelectorAll('.s5-nav-row .tab-btn');
  const viewClusters = document.getElementById('s5-view-clusters');
  const viewGrouped = document.getElementById('s5-view-grouped');
  const viewFreq = document.getElementById('s5-view-frequent');
  const viewLong = document.getElementById('s5-view-longest');
  const toolbar = document.getElementById('s5-toolbar');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      s5ActiveTab = btn.dataset.s5View;

      if (viewClusters) viewClusters.style.display = 'none';
      if (viewGrouped) viewGrouped.style.display = 'none';
      if (viewFreq) viewFreq.style.display = 'none';
      if (viewLong) viewLong.style.display = 'none';

      if (s5ActiveTab === 'clusters') {
        if (viewClusters) viewClusters.style.display = 'block';
        if (toolbar) toolbar.style.display = 'flex';
        renderSection5Clusters();
      } else if (s5ActiveTab === 'grouped') {
        if (viewGrouped) viewGrouped.style.display = 'block';
        if (toolbar) toolbar.style.display = 'flex';
        renderSection5GroupedChains();
      } else if (s5ActiveTab === 'frequent') {
        if (viewFreq) viewFreq.style.display = 'block';
        if (toolbar) toolbar.style.display = 'flex';
        renderSection5Chains();
      } else if (s5ActiveTab === 'longest') {
        if (viewLong) viewLong.style.display = 'block';
        if (toolbar) toolbar.style.display = 'none';
        renderSection5Longest();
      }
    });
  });

  // 6. Pagination buttons
  const btnPrev = document.getElementById('s5-btn-prev');
  const btnNext = document.getElementById('s5-btn-next');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (s5CurrentPage > 1) {
        s5CurrentPage--;
        renderSection5Chains();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      s5CurrentPage++;
      renderSection5Chains();
    });
  }

  const btnGPrev = document.getElementById('s5-btn-grouped-prev');
  const btnGNext = document.getElementById('s5-btn-grouped-next');
  if (btnGPrev) {
    btnGPrev.addEventListener('click', () => {
      if (s5GroupedCurrentPage > 1) {
        s5GroupedCurrentPage--;
        renderSection5GroupedChains();
      }
    });
  }
  if (btnGNext) {
    btnGNext.addEventListener('click', () => {
      s5GroupedCurrentPage++;
      renderSection5GroupedChains();
    });
  }

  const btnCPrev = document.getElementById('s5-btn-clusters-prev');
  const btnCNext = document.getElementById('s5-btn-clusters-next');
  if (btnCPrev) {
    btnCPrev.addEventListener('click', () => {
      if (s5ClustersCurrentPage > 1) {
        s5ClustersCurrentPage--;
        renderSection5Clusters();
      }
    });
  }
  if (btnCNext) {
    btnCNext.addEventListener('click', () => {
      s5ClustersCurrentPage++;
      renderSection5Clusters();
    });
  }

  // Initial render default to clusters view
  renderSection5Clusters();
}

function renderActiveSection5View() {
  if (s5ActiveTab === 'clusters') {
    renderSection5Clusters();
  } else if (s5ActiveTab === 'grouped') {
    renderSection5GroupedChains();
  } else if (s5ActiveTab === 'frequent') {
    renderSection5Chains();
  }
}

function getFilteredSection5Chains() {
  const rc = metricsData.recurring_chains;
  if (!rc || !rc.chains) return [];

  let list = rc.chains;
  if (s5FilterDedup === 'maximal') {
    list = list.filter(c => c.is_maximal);
  }
  if (s5FilterLength === '3') {
    list = list.filter(c => c.length === 3);
  } else if (s5FilterLength === '4') {
    list = list.filter(c => c.length === 4);
  } else if (s5FilterLength === '5+') {
    list = list.filter(c => c.length >= 5);
  }
  if (s5FilterMember !== 'all') {
    list = list.filter(c => c.members.includes(s5FilterMember));
  }
  return list;
}

function getFilteredSection5GroupedChains() {
  const rc = metricsData.recurring_chains;
  if (!rc || !rc.grouped_chains) return [];

  let list = rc.grouped_chains;
  if (s5FilterDedup === 'maximal') {
    list = list.filter(c => c.is_maximal);
  }
  if (s5FilterLength === '3') {
    list = list.filter(c => c.length === 3);
  } else if (s5FilterLength === '4') {
    list = list.filter(c => c.length === 4);
  } else if (s5FilterLength === '5+') {
    list = list.filter(c => c.length >= 5);
  }
  if (s5FilterMember !== 'all') {
    list = list.filter(c => c.members.includes(s5FilterMember));
  }
  return list;
}

function getFilteredSection5Clusters() {
  const rc = metricsData.recurring_chains;
  if (!rc || !rc.cluster_groups) return [];

  let list = rc.cluster_groups;
  if (s5FilterDedup === 'maximal') {
    list = list.filter(c => c.is_maximal);
  }
  if (s5FilterLength === '3') {
    list = list.filter(c => c.length === 3);
  } else if (s5FilterLength === '4') {
    list = list.filter(c => c.length === 4);
  } else if (s5FilterLength === '5+') {
    list = list.filter(c => c.length >= 5);
  }
  if (s5FilterMember !== 'all') {
    list = list.filter(c => c.members.includes(s5FilterMember));
  }
  return list;
}

function renderSection5Clusters() {
  const grid = document.getElementById('s5-clusters-grid');
  const displayCountEl = document.getElementById('s5-display-count');
  const paginationBar = document.getElementById('s5-clusters-pagination-bar');
  const pageInfoEl = document.getElementById('s5-page-clusters-info');
  const btnPrev = document.getElementById('s5-btn-clusters-prev');
  const btnNext = document.getElementById('s5-btn-clusters-next');

  if (!grid) return;

  const filtered = getFilteredSection5Clusters();
  if (displayCountEl) displayCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">
        No speaking groups match the selected filters.
      </div>
    `;
    if (paginationBar) paginationBar.style.display = 'none';
    renderSection5Inspector(null, 'clusters');
    return;
  }

  const totalPages = Math.ceil(filtered.length / S5_PAGE_SIZE);
  if (s5ClustersCurrentPage > totalPages) s5ClustersCurrentPage = totalPages;
  if (s5ClustersCurrentPage < 1) s5ClustersCurrentPage = 1;

  if (paginationBar) {
    paginationBar.style.display = totalPages > 1 ? 'flex' : 'none';
    if (pageInfoEl) pageInfoEl.textContent = `Page ${s5ClustersCurrentPage} of ${totalPages} (${filtered.length} total)`;
    if (btnPrev) btnPrev.disabled = s5ClustersCurrentPage <= 1;
    if (btnNext) btnNext.disabled = s5ClustersCurrentPage >= totalPages;
  }

  const startIdx = (s5ClustersCurrentPage - 1) * S5_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + S5_PAGE_SIZE);

  if (!s5SelectedCluster || !filtered.some(c => c.id === s5SelectedCluster.id)) {
    s5SelectedCluster = pageItems[0];
  }

  grid.innerHTML = pageItems.map((c, idx) => {
    const isSelected = s5SelectedCluster && s5SelectedCluster.id === c.id;
    const globalRank = startIdx + idx + 1;
    const lenLabel = c.length === 3 ? 'Trio Group (3)' : (c.length === 4 ? 'Quartet Group (4)' : `${c.length}-Person Cohort`);

    const memberPills = c.members.map((name) => {
      const isMatch = s5FilterMember !== 'all' && name === s5FilterMember;
      const classes = [
        's5-member-pill',
        isMatch ? 'is-focus-match' : ''
      ].filter(Boolean).join(' ');

      return `<span class="${classes}">${name}</span>`;
    }).join('<span class="s5-flow-arrow">&</span>');

    const topSeq = c.top_permutation ? c.top_permutation.sequence_str : '';
    const topSeqCount = c.top_permutation ? c.top_permutation.count : 0;

    return `
      <div class="s5-chain-card ${isSelected ? 'active-selected' : ''}" data-cluster-id="${c.id}">
        <div class="s5-chain-card-header">
          <div class="s5-chain-badge-group">
            <span class="s5-badge-length">#${globalRank} • ${lenLabel}</span>
            <span class="s5-badge-bidirectional">${c.distinct_orders_count} orders</span>
          </div>
          <div class="s5-chain-count-badge">
            ${c.total_count}<span>x</span>
          </div>
        </div>

        <div class="s5-domino-flow">
          ${memberPills}
        </div>

        <div class="s5-chain-meta">
          <div>Top: <strong>${topSeq}</strong> (${topSeqCount}x)</div>
          <div>Avg Turn #${c.avg_start_pos}</div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-cluster-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.clusterId;
      const cluster = filtered.find(item => item.id === id);
      if (!cluster) return;

      s5SelectedCluster = cluster;
      grid.querySelectorAll('[data-cluster-id]').forEach(c => c.classList.remove('active-selected'));
      card.classList.add('active-selected');
      renderSection5Inspector(cluster, 'clusters');
    });
  });

  renderSection5Inspector(s5SelectedCluster, 'clusters');
}

function renderSection5Chains() {
  const grid = document.getElementById('s5-chains-grid');
  const displayCountEl = document.getElementById('s5-display-count');
  const paginationBar = document.getElementById('s5-pagination-bar');
  const pageInfoEl = document.getElementById('s5-page-info');
  const btnPrev = document.getElementById('s5-btn-prev');
  const btnNext = document.getElementById('s5-btn-next');

  if (!grid) return;

  const filtered = getFilteredSection5Chains();
  if (displayCountEl) displayCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">
        No recurring chains match the selected filters.
      </div>
    `;
    if (paginationBar) paginationBar.style.display = 'none';
    renderSection5Inspector(null, 'directional');
    return;
  }

  const totalPages = Math.ceil(filtered.length / S5_PAGE_SIZE);
  if (s5CurrentPage > totalPages) s5CurrentPage = totalPages;
  if (s5CurrentPage < 1) s5CurrentPage = 1;

  if (paginationBar) {
    paginationBar.style.display = totalPages > 1 ? 'flex' : 'none';
    if (pageInfoEl) pageInfoEl.textContent = `Page ${s5CurrentPage} of ${totalPages} (${filtered.length} total)`;
    if (btnPrev) btnPrev.disabled = s5CurrentPage <= 1;
    if (btnNext) btnNext.disabled = s5CurrentPage >= totalPages;
  }

  const startIdx = (s5CurrentPage - 1) * S5_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + S5_PAGE_SIZE);

  if (!s5SelectedChain || !filtered.some(c => c.id === s5SelectedChain.id)) {
    s5SelectedChain = pageItems[0];
  }

  grid.innerHTML = pageItems.map((c, idx) => {
    const isSelected = s5SelectedChain && s5SelectedChain.id === c.id;
    const globalRank = startIdx + idx + 1;
    const lenLabel = c.length === 3 ? 'Trio (3)' : (c.length === 4 ? 'Quartet (4)' : `${c.length}-Run`);

    const dateChips = (c.occurrences || []).slice(0, 2).map(o => `<span class="s5-date-chip">${o.date}</span>`).join(' ');
    const extraDatesCount = (c.occurrences || []).length - 2;
    const extraDatesBadge = extraDatesCount > 0 ? `<span class="s5-date-chip">+${extraDatesCount}</span>` : '';

    const memberPills = c.members.map((name, mIdx) => {
      const isMatch = s5FilterMember !== 'all' && name === s5FilterMember;
      const isInit = mIdx === 0;
      const isFin = mIdx === c.members.length - 1;
      const classes = [
        's5-member-pill',
        isMatch ? 'is-focus-match' : '',
        isInit ? 'is-initiator' : '',
        isFin ? 'is-finisher' : ''
      ].filter(Boolean).join(' ');

      return `<span class="${classes}">${name}</span>`;
    }).join('<span class="s5-flow-arrow">→</span>');

    return `
      <div class="s5-chain-card ${isSelected ? 'active-selected' : ''}" data-chain-id="${c.id}">
        <div class="s5-chain-card-header">
          <div class="s5-chain-badge-group">
            <span class="s5-badge-length">#${globalRank} • ${lenLabel}</span>
          </div>
          <div class="s5-chain-count-badge">
            ${c.count}<span>x</span>
          </div>
        </div>

        <div class="s5-domino-flow">
          ${memberPills}
        </div>

        <div class="s5-chain-meta">
          <div>Avg Turn #${c.avg_start_pos}</div>
          <div>${dateChips} ${extraDatesBadge}</div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.s5-chain-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.chainId;
      const chain = filtered.find(item => item.id === id);
      if (!chain) return;

      s5SelectedChain = chain;
      grid.querySelectorAll('.s5-chain-card').forEach(c => c.classList.remove('active-selected'));
      card.classList.add('active-selected');
      renderSection5Inspector(chain, 'directional');
    });
  });

  renderSection5Inspector(s5SelectedChain, 'directional');
}

function renderSection5GroupedChains() {
  const grid = document.getElementById('s5-grouped-grid');
  const displayCountEl = document.getElementById('s5-display-count');
  const paginationBar = document.getElementById('s5-grouped-pagination-bar');
  const pageInfoEl = document.getElementById('s5-page-grouped-info');
  const btnPrev = document.getElementById('s5-btn-grouped-prev');
  const btnNext = document.getElementById('s5-btn-grouped-next');

  if (!grid) return;

  const filtered = getFilteredSection5GroupedChains();
  if (displayCountEl) displayCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">
        No reversible corridors match the selected filters.
      </div>
    `;
    if (paginationBar) paginationBar.style.display = 'none';
    renderSection5Inspector(null, 'grouped');
    return;
  }

  const totalPages = Math.ceil(filtered.length / S5_PAGE_SIZE);
  if (s5GroupedCurrentPage > totalPages) s5GroupedCurrentPage = totalPages;
  if (s5GroupedCurrentPage < 1) s5GroupedCurrentPage = 1;

  if (paginationBar) {
    paginationBar.style.display = totalPages > 1 ? 'flex' : 'none';
    if (pageInfoEl) pageInfoEl.textContent = `Page ${s5GroupedCurrentPage} of ${totalPages} (${filtered.length} total)`;
    if (btnPrev) btnPrev.disabled = s5GroupedCurrentPage <= 1;
    if (btnNext) btnNext.disabled = s5GroupedCurrentPage >= totalPages;
  }

  const startIdx = (s5GroupedCurrentPage - 1) * S5_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + S5_PAGE_SIZE);

  if (!s5SelectedGroupedChain || !filtered.some(c => c.id === s5SelectedGroupedChain.id)) {
    s5SelectedGroupedChain = pageItems[0];
  }

  grid.innerHTML = pageItems.map((c, idx) => {
    const isSelected = s5SelectedGroupedChain && s5SelectedGroupedChain.id === c.id;
    const globalRank = startIdx + idx + 1;
    const lenLabel = c.length === 3 ? 'Trio (3)' : (c.length === 4 ? 'Quartet (4)' : `${c.length}-Corridor`);

    const memberPills = c.members.map((name) => {
      const isMatch = s5FilterMember !== 'all' && name === s5FilterMember;
      const classes = [
        's5-member-pill',
        isMatch ? 'is-focus-match' : ''
      ].filter(Boolean).join(' ');

      return `<span class="${classes}">${name}</span>`;
    }).join('<span class="s5-flow-arrow">⇄</span>');

    return `
      <div class="s5-chain-card ${isSelected ? 'active-selected' : ''}" data-grouped-id="${c.id}">
        <div class="s5-chain-card-header">
          <div class="s5-chain-badge-group">
            <span class="s5-badge-length">#${globalRank} • ${lenLabel}</span>
            ${c.is_bidirectional ? '<span class="s5-badge-bidirectional">Bidirectional ⇄</span>' : ''}
          </div>
          <div class="s5-chain-count-badge">
            ${c.total_count}<span>x</span>
          </div>
        </div>

        <div class="s5-domino-flow">
          ${memberPills}
        </div>

        <div class="s5-chain-meta">
          <div>Fwd: <strong>${c.fwd_count}x</strong> • Rev: <strong>${c.rev_count}x</strong></div>
          <div>Avg Turn #${c.avg_start_pos}</div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-grouped-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.groupedId;
      const chain = filtered.find(item => item.id === id);
      if (!chain) return;

      s5SelectedGroupedChain = chain;
      grid.querySelectorAll('[data-grouped-id]').forEach(c => c.classList.remove('active-selected'));
      card.classList.add('active-selected');
      renderSection5Inspector(chain, 'grouped');
    });
  });

  renderSection5Inspector(s5SelectedGroupedChain, 'grouped');
}

function renderSection5Inspector(item, mode) {
  let container;
  if (mode === 'clusters') {
    container = document.getElementById('s5-clusters-inspector-body');
  } else if (mode === 'grouped') {
    container = document.getElementById('s5-grouped-inspector-body');
  } else {
    container = document.getElementById('s5-inspector-body');
  }

  if (!container) return;

  if (!item) {
    container.innerHTML = `
      <div style="padding: 20px; font-size: 0.78rem; color: var(--text-dim); text-align: center;">
        Select any item on the left to inspect permutations, dates, and turn details.
      </div>
    `;
    return;
  }

  if (mode === 'clusters') {
    container.innerHTML = `
      <div class="s5-inspector-card">
        <div class="s5-insp-title-row">
          <div class="s5-insp-chain-display">
            ${item.members.map(m => `<span class="s5-member-pill">${m}</span>`).join('<span class="s5-flow-arrow">&</span>')}
          </div>
          <span class="stat-value highlight-red" style="font-size:1.15rem; line-height:1;">${item.total_count}x</span>
        </div>

        <div class="s5-insp-stat-grid">
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Group Cohort</span>
            <span class="s5-insp-stat-val">${item.length} Teammates</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Avg Turn Pos</span>
            <span class="s5-insp-stat-val">Turn #${item.avg_start_pos}</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Distinct Orders</span>
            <span class="s5-insp-stat-val" style="color:var(--pacific-blue);">${item.distinct_orders_count} permutations</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Top Sequence</span>
            <span class="s5-insp-stat-val" style="color:var(--strawberry-red);">${item.top_permutation ? item.top_permutation.count + 'x' : '0x'}</span>
          </div>
        </div>

        <div style="font-family:var(--font-mono); font-size:0.70rem; font-weight:700; text-transform:uppercase; color:var(--text-dim); margin-top:2px;">
          Observed Hand-off Orders (${item.permutations ? item.permutations.length : 0})
        </div>
        <div class="s5-insp-dates-list" style="max-height: 160px;">
          ${(item.permutations || []).map(p => `
            <div class="s5-insp-date-row">
              <span style="font-weight:700; color:var(--text-main);">${p.sequence_str}</span>
              <span style="color:var(--strawberry-red); font-weight:700;">${p.count}x</span>
            </div>
          `).join('')}
        </div>

        <div style="font-family:var(--font-mono); font-size:0.70rem; font-weight:700; text-transform:uppercase; color:var(--text-dim); margin-top:4px;">
          All Session Occurrences (${item.occurrences.length})
        </div>
        <div class="s5-insp-dates-list" style="max-height: 140px;">
          ${item.occurrences.map(o => `
            <div class="s5-insp-date-row">
              <span><strong>${o.date}</strong> (Turn #${o.start_pos})</span>
              <span style="color:var(--text-dim); font-size:0.68rem;">${(o.sequence || []).join(' → ')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (mode === 'directional') {
    container.innerHTML = `
      <div class="s5-inspector-card">
        <div class="s5-insp-title-row">
          <div class="s5-insp-chain-display">
            ${item.members.map((m, i) => `
              <span class="s5-member-pill ${i===0?'is-initiator':(i===item.members.length-1?'is-finisher':'')}">${m}</span>
            `).join('<span class="s5-flow-arrow">→</span>')}
          </div>
          <span class="stat-value highlight-red" style="font-size:1.1rem; line-height:1;">${item.count}x</span>
        </div>

        <div class="s5-insp-stat-grid">
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Sequence Length</span>
            <span class="s5-insp-stat-val">${item.length} Teammates</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Avg Turn Pos</span>
            <span class="s5-insp-stat-val">Turn #${item.avg_start_pos}</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Initiator</span>
            <span class="s5-insp-stat-val" style="color:var(--pacific-blue);">${item.initiator}</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Final Anchor</span>
            <span class="s5-insp-stat-val" style="color:var(--strawberry-red);">${item.finisher}</span>
          </div>
        </div>

        <div style="font-family:var(--font-mono); font-size:0.70rem; font-weight:700; text-transform:uppercase; color:var(--text-dim); margin-top:2px;">
          Session Occurrences (${item.occurrences.length})
        </div>
        <div class="s5-insp-dates-list">
          ${item.occurrences.map(o => `
            <div class="s5-insp-date-row">
              <span><strong>${o.date}</strong></span>
              <span style="color:var(--text-dim);">Turn #${o.start_pos} of ${o.session_size}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    const fwdStr = item.members.join(' → ');
    const revStr = [...item.members].reverse().join(' → ');
    container.innerHTML = `
      <div class="s5-inspector-card">
        <div class="s5-insp-title-row">
          <div class="s5-insp-chain-display">
            ${item.members.map(m => `<span class="s5-member-pill">${m}</span>`).join('<span class="s5-flow-arrow">⇄</span>')}
          </div>
          <span class="stat-value highlight-red" style="font-size:1.1rem; line-height:1;">${item.total_count}x</span>
        </div>

        <div class="s5-insp-stat-grid">
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Corridor Status</span>
            <span class="s5-insp-stat-val" style="color:${item.is_bidirectional?'var(--pacific-blue)':'var(--text-main)'};">
              ${item.is_bidirectional ? 'Bidirectional ⇄' : 'One-way Only →'}
            </span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Avg Turn Pos</span>
            <span class="s5-insp-stat-val">Turn #${item.avg_start_pos}</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Forward (A→B→C)</span>
            <span class="s5-insp-stat-val" style="color:var(--pacific-blue);">${item.fwd_count} times</span>
          </div>
          <div class="s5-insp-stat-item">
            <span class="s5-insp-stat-label">Reverse (C→B→A)</span>
            <span class="s5-insp-stat-val" style="color:var(--strawberry-red);">${item.rev_count} times</span>
          </div>
        </div>

        <div style="font-size:0.76rem; color:var(--text-muted); line-height:1.4;">
          <div><strong style="color:var(--pacific-blue);">Forward:</strong> ${fwdStr} (${item.fwd_count}x)</div>
          <div><strong style="color:var(--strawberry-red);">Reverse:</strong> ${revStr} (${item.rev_count}x)</div>
        </div>

        <div style="font-family:var(--font-mono); font-size:0.70rem; font-weight:700; text-transform:uppercase; color:var(--text-dim); margin-top:2px;">
          All Corridor Dates (${item.occurrences.length})
        </div>
        <div class="s5-insp-dates-list">
          ${item.occurrences.map(o => {
            const isFwd = (item.fwd_occurrences || []).some(fo => fo.date === o.date && fo.start_pos === o.start_pos);
            const tag = isFwd 
              ? `<span style="color:var(--pacific-blue); font-weight:700;">Forward →</span>` 
              : `<span style="color:var(--strawberry-red); font-weight:700;">Reverse ←</span>`;
            return `
              <div class="s5-insp-date-row">
                <span><strong>${o.date}</strong> (Turn #${o.start_pos})</span>
                <span>${tag}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
}

function renderSection5Longest() {
  const container = document.getElementById('s5-longest-container');
  if (!container) return;

  const rc = metricsData.recurring_chains;
  if (!rc) return;

  const recordRun = rc.summary.record_run || rc.summary.mirror_standup;
  const longestRuns = rc.longest_runs || [];

  let html = '';

  // 1. Record Run Spotlight
  if (recordRun) {
    const dates = recordRun.occurrences.map(o => o.date);
    const date1 = dates[0] || '';
    const date2 = dates[1] || '';
    const occ1 = recordRun.occurrences[0];
    const occ2 = recordRun.occurrences[1];
    const titleText = recordRun.length >= 10 ? '🪞 The Mirror Standup' : `🏆 Record ${recordRun.length}-Person Run`;

    html += `
      <div class="s5-spotlight-card">
        <div class="s5-spotlight-header">
          <div>
            <div class="s5-spotlight-title">
              <span>${titleText}</span>
              <span class="s5-spotlight-badge">Unbroken Record</span>
            </div>
            <div class="s5-spotlight-desc">
              On <strong>${date1}</strong> and again on <strong>${date2}</strong>, <strong>${recordRun.length} teammates</strong> handed off the baton in <em>the exact same sequence</em>. Across ${metricsData.summary?.total_standups || 302} team sessions, this is the longest matching contiguous speaking order in team history.
            </div>
          </div>
          <div class="s5-chain-count-badge" style="font-size: 1.3rem;">
            ${recordRun.length} <span>Speakers</span>
          </div>
        </div>

        <div class="s5-mirror-compare-grid">
          <div class="s5-session-panel">
            <div class="s5-session-header">
              <span>Session #1: ${date1}</span>
              <span class="meta-tag">Turn #${occ1?.start_pos || 1} → #${(occ1?.start_pos || 1) + recordRun.length - 1}</span>
            </div>
            <div class="s5-session-list">
              ${recordRun.members.map((name, i) => `
                <div class="s5-session-turn-row">
                  <span class="s5-turn-num">#${(occ1?.start_pos || 1) + i}</span>
                  <span class="s5-turn-name">${name}</span>
                  ${i < recordRun.members.length - 1 ? '<span style="color:var(--text-dim); margin-left:auto;">passed to →</span>' : '<span style="color:var(--strawberry-red); margin-left:auto; font-weight:700;">Final Finisher</span>'}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="s5-session-panel">
            <div class="s5-session-header">
              <span>Session #2: ${date2}</span>
              <span class="meta-tag highlight-blue">Turn #${occ2?.start_pos || 1} → #${(occ2?.start_pos || 1) + recordRun.length - 1}</span>
            </div>
            <div class="s5-session-list">
              ${recordRun.members.map((name, i) => `
                <div class="s5-session-turn-row">
                  <span class="s5-turn-num">#${(occ2?.start_pos || 1) + i}</span>
                  <span class="s5-turn-name">${name}</span>
                  ${i < recordRun.members.length - 1 ? '<span style="color:var(--text-dim); margin-left:auto;">passed to →</span>' : '<span style="color:var(--strawberry-red); margin-left:auto; font-weight:700;">Final Finisher</span>'}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Other notable long unbroken runs (Length >= 5)
  const otherLong = longestRuns.filter(c => !recordRun || c.id !== recordRun.id);
  if (otherLong.length > 0) {
    html += `
      <div class="profile-card-block" style="padding: 16px 18px; margin-top: 14px;">
        <div class="block-header" style="margin-bottom: 12px; padding-bottom: 8px;">
          <span class="block-title">Additional Record Sequences (Length 5+)</span>
          <span class="block-badge">${otherLong.length} Chains</span>
        </div>
        <div class="s5-chains-grid">
          ${otherLong.map(c => `
            <div class="s5-chain-card" data-chain-id="${c.id}">
              <div class="s5-chain-card-header">
                <span class="s5-badge-length">${c.length}-Person Sequence</span>
                <div class="s5-chain-count-badge">${c.count}<span>x</span></div>
              </div>
              <div class="s5-domino-flow">
                ${c.members.map((name, mIdx) => `
                  <span class="s5-member-pill ${mIdx === 0 ? 'is-initiator' : (mIdx === c.members.length - 1 ? 'is-finisher' : '')}">${name}</span>
                `).join('<span class="s5-flow-arrow">→</span>')}
              </div>
              <div class="s5-chain-meta">
                <div>Avg Turn #${c.avg_start_pos}</div>
                <div>${c.occurrences.map(o => `<span class="s5-date-chip">${o.date}</span>`).join(' ')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// 12. Bootstrap Application
async function initApp() {
  try {
    metricsData = await loadMetricsData();

    allTeamMembers = metricsData.attendance_by_person
      .map(p => p.name)
      .sort((a, b) => a.localeCompare(b));

    renderKPIs(metricsData.summary);
    setupListeners();
    renderChart();

    // Initialize Section 2 with default member
    const profileSelect = document.getElementById('profile-select');
    const defaultMember = profileSelect ? profileSelect.value : 'Leander';
    renderPersonalProfile(defaultMember);

    // Initialize Section 3: Mutual Chemistry
    initSection3();

    // Initialize Section 4: Teacher's Pet Dynamics
    initSection4();

    // Initialize Section 5: Recurring Baton Chains
    initSection5();

    // Initialize Section 6: Mistakes
    initSection6();
  } catch (err) {
    console.error('Failed to initialize standup app:', err);
    document.getElementById('standup-attendance-component').innerHTML = `
      <div style="padding: 16px; border-top: 2px solid ${PALETTE.strawberryRed}; border-bottom: 2px solid ${PALETTE.strawberryRed};">
        <strong>Error:</strong> Could not load standup metrics.
      </div>
    `;
  }
}

// ==========================================================================
// SECTION 6: Mistakes (picked someone who had already gone)
// ==========================================================================
let s6Filter = 'all';
let s6Selected = null;

function initSection6() {
  const mk = metricsData.mistakes;
  if (!mk || !mk.summary) return;
  const s = mk.summary;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const lateBucket = (mk.timing || []).find(t => t.key === 'late');

  setText('s6-kpi-total', s.total_mistakes);
  setText('s6-kpi-total-sub', `${s.overall_rate_pct}% of ${s.total_turns.toLocaleString()} hand-offs`);
  if (s.top_offender) {
    setText('s6-kpi-top', s.top_offender.name);
    setText('s6-kpi-top-sub', `${s.top_offender.mistakes} slips • ${s.top_offender.rate_pct}% of turns`);
  }
  setText('s6-kpi-sessions', `${s.sessions_with_mistakes}`);
  setText('s6-kpi-sessions-sub', `${s.pct_sessions_with_mistakes}% of ${s.total_sessions} standups`);
  setText('s6-kpi-clean', `${s.mistake_free_count}`);
  setText('s6-kpi-clean-sub', `of ${mk.members.length} teammates never slipped`);
  setText('s6-badge-rate', `${s.overall_rate_pct}% overall rate`);
  if (lateBucket) {
    const share = s.total_mistakes ? Math.round((lateBucket.mistakes / s.total_mistakes) * 100) : 0;
    setText('s6-badge-late', `${share}% in final third`);
  }

  // Tabs
  const tabBtns = document.querySelectorAll('.s6-nav-row .tab-btn');
  const panels = {
    leaderboard: document.getElementById('s6-view-leaderboard'),
    timing: document.getElementById('s6-view-timing'),
    sessions: document.getElementById('s6-view-sessions')
  };
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      Object.entries(panels).forEach(([k, el]) => { if (el) el.style.display = (k === btn.dataset.s6View) ? 'block' : 'none'; });
    });
  });

  // Filters
  const fBtns = document.querySelectorAll('[data-s6-filter]');
  fBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      fBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      s6Filter = btn.dataset.s6Filter;
      renderSection6Leaderboard();
    });
  });

  s6Selected = s.top_offender ? s.top_offender.name : (mk.members[0] && mk.members[0].name);
  renderSection6Leaderboard();
  renderSection6Timing();
  renderSection6Sessions();
}

function renderSection6Leaderboard() {
  const wrap = document.getElementById('s6-rows-wrap');
  const mk = metricsData.mistakes;
  if (!wrap || !mk) return;

  let list = [...mk.members];
  if (s6Filter === 'offenders') list = list.filter(m => m.mistakes > 0);
  else if (s6Filter === 'clean') list = list.filter(m => m.mistakes === 0);
  list.sort((a, b) => b.diff - a.diff || b.mistakes - a.mistakes);

  if (!list.length) {
    wrap.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:0.8rem;">No teammates match this filter.</div>`;
    renderSection6Inspector(null);
    return;
  }
  if (!list.some(m => m.name === s6Selected)) s6Selected = list[0].name;

  wrap.innerHTML = list.map((m, idx) => {
    const diffStr = m.diff > 0 ? `+${m.diff}` : `${m.diff}`;
    const diffClass = m.diff > 0 ? 'delta-pos' : 'delta-neg';
    const barW = Math.min(100, m.rate_pct * 14);
    return `
      <div class="s4-member-row ${m.name === s6Selected ? 'row-active' : ''}" data-s6-member="${m.name}">
        <span class="s4-col-rank">#${idx + 1}</span>
        <div class="s4-col-name"><span class="s4-name-text">${m.name}</span></div>
        <span class="s4-col-opps">${m.turns} turns</span>
        <div class="s4-col-picks">
          <strong>${m.mistakes}</strong> / ${m.expected}
          <span class="s4-delta-pill ${diffClass}">${diffStr}</span>
        </div>
        <div class="s4-col-rate">
          <span>${m.rate_pct}%</span>
          <div class="s4-mini-rate-bar"><div class="s4-mini-rate-fill ${m.diff >= 2 ? 'high-affinity' : ''}" style="width:${barW}%;"></div></div>
        </div>
        <span class="s4-col-freedom">${m.avg_turn_pos != null ? '#' + m.avg_turn_pos : '—'}</span>
        <span class="s4-col-freedom" style="font-size:0.68rem;">${m.last_date || '—'}</span>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.s4-member-row').forEach(row => {
    row.addEventListener('click', () => {
      s6Selected = row.dataset.s6Member;
      wrap.querySelectorAll('.s4-member-row').forEach(r => r.classList.toggle('row-active', r === row));
      renderSection6Inspector(s6Selected);
    });
  });
  renderSection6Inspector(s6Selected);
}

function renderSection6Inspector(name) {
  const body = document.getElementById('s6-inspector-body');
  if (!body) return;
  const m = (metricsData.mistakes?.members || []).find(x => x.name === name);
  if (!m) {
    body.innerHTML = `<div style="padding:20px;font-size:0.78rem;color:var(--text-dim);text-align:center;">Select a teammate to see their slip-ups.</div>`;
    return;
  }
  const diffStr = m.diff > 0 ? `+${m.diff}` : `${m.diff}`;
  const diffColor = m.diff > 0 ? 'var(--strawberry-red)' : 'var(--pacific-blue)';
  const verdict = m.mistakes === 0
    ? `Clean sheet across ${m.turns} hand-offs.`
    : (m.diff > 1 ? `Slips noticeably more than the timing of their turns would predict.`
      : (m.diff < -1 ? `Slips less than their late-turn exposure would predict.` : `Right in line with what their turn positions predict.`));

  body.innerHTML = `
    <div class="s5-inspector-card">
      <div class="s5-insp-title-row">
        <span class="s4-insp-name">${m.name}</span>
        <span class="stat-value highlight-red" style="font-size:1.1rem;line-height:1;">${m.mistakes}x</span>
      </div>
      <div class="s5-insp-stat-grid">
        <div class="s5-insp-stat-item"><span class="s5-insp-stat-label">Slip Rate</span><span class="s5-insp-stat-val">${m.rate_pct}%</span></div>
        <div class="s5-insp-stat-item"><span class="s5-insp-stat-label">vs Expected</span><span class="s5-insp-stat-val" style="color:${diffColor};">${diffStr} (exp ${m.expected})</span></div>
        <div class="s5-insp-stat-item"><span class="s5-insp-stat-label">Avg Slip Turn</span><span class="s5-insp-stat-val">${m.avg_turn_pos != null ? 'Turn #' + m.avg_turn_pos : '—'}</span></div>
        <div class="s5-insp-stat-item"><span class="s5-insp-stat-label">Session Depth</span><span class="s5-insp-stat-val">${m.avg_turn_pct != null ? m.avg_turn_pct + '%' : '—'}</span></div>
      </div>
      <div style="font-size:0.76rem;color:var(--text-muted);line-height:1.4;">${verdict}</div>
      ${m.events.length ? `
        <div style="font-family:var(--font-mono);font-size:0.70rem;font-weight:700;text-transform:uppercase;color:var(--text-dim);">Slip-Up Log (${m.events.length})</div>
        <div class="s5-insp-dates-list">
          ${[...m.events].reverse().map(e => `
            <div class="s5-insp-date-row">
              <span><strong>${e.date}</strong></span>
              <span style="color:var(--text-dim);">Turn #${e.position} of ${e.session_size}</span>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
}

function renderSection6Timing() {
  const grid = document.getElementById('s6-timing-grid');
  const mk = metricsData.mistakes;
  if (!grid || !mk) return;

  const maxRate = Math.max(...mk.timing.map(t => t.rate_pct), 0.01);
  const timingHtml = mk.timing.map(t => `
    <div class="s6-bar-row">
      <span class="s6-bar-label">${t.label}</span>
      <div class="s6-bar-track"><div class="s6-bar-fill ${t.rate_pct === maxRate ? 'hot' : ''}" style="width:${(t.rate_pct / maxRate) * 100}%;"></div></div>
      <span class="s6-bar-stat"><strong>${t.mistakes}</strong> in ${t.turns.toLocaleString()} (${t.rate_pct}%)</span>
    </div>`).join('');

  const maxMon = Math.max(...mk.monthly.map(m => m.mistakes), 1);
  const monthHtml = `
    <div class="s6-month-chart">
      ${mk.monthly.map(m => `
        <div class="s6-month-col" title="${m.label}: ${m.mistakes} slips in ${m.turns} turns (${m.rate_pct}%)">
          <span class="s6-month-val">${m.mistakes}</span>
          <div class="s6-month-bar" style="height:${(m.mistakes / maxMon) * 100}%;"></div>
        </div>`).join('')}
    </div>
    <div class="s6-month-labels">${mk.monthly.map(m => `<span>${m.label.replace(' 20', ' ’')}</span>`).join('')}</div>`;

  grid.innerHTML = `
    <div class="s6-panel">
      <div class="s6-panel-title">Slip rate by point in the session</div>
      <div class="s6-panel-sub">Share of hand-offs that were mistakes, split into thirds of the speaking order</div>
      ${timingHtml}
    </div>
    <div class="s6-panel">
      <div class="s6-panel-title">Slip-ups by month</div>
      <div class="s6-panel-sub">Count of mistakes logged each month</div>
      ${monthHtml}
    </div>`;
}

function renderSection6Sessions() {
  const list = document.getElementById('s6-session-list');
  const mk = metricsData.mistakes;
  if (!list || !mk) return;

  list.innerHTML = mk.sessions.map(s => `
    <div class="s6-session-card ${s.count > 1 ? 'multi' : ''}">
      <div class="s6-session-head"><span>${s.date}</span><span>${s.count} slip${s.count > 1 ? 's' : ''}</span></div>
      <div class="s6-session-people">
        ${s.offenders.map(o => `<span class="s5-member-pill">${o.name} <small style="color:var(--text-dim);margin-left:4px;">#${o.position}</small></span>`).join('')}
      </div>
      <div class="s6-session-meta">${s.session_size} speakers that day</div>
    </div>`).join('') || `<div style="padding:24px;color:var(--text-dim);">No mistakes recorded.</div>`;
}

document.addEventListener('DOMContentLoaded', initApp);


