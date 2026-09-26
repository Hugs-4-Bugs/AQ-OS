"""Charts for the AcquisitionOS valuation report — styled per charts.md
(no top/right spines, dashed grid 20% opacity, donut default, palette colors)."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Template 07 Crystal Blue body palette (fixed per cover.md)
ACCENT   = '#2d7ab3'
ACCENT2  = '#4da8da'
HEADER   = '#1a4a7a'
BORDER   = '#c0d0e2'
TEXTP    = '#142840'
MUTED    = '#5a7a96'
CARD     = '#e4ecf5'

# ── Chart 1: Valuation scenario ranges (horizontal range bars) ──
fig, ax = plt.subplots(figsize=(8.6, 3.4), dpi=200, constrained_layout=True)
scenarios = ['D. Strategic\n(aligned buyer,\nafter cleanup)',
             'B. Product\n(with users\n& traction)',
             'A. Technology /\nasset sale\n(as-is today)']
lows  = [75_000, 15_000, 5_000]
highs = [250_000, 75_000, 60_000]
y = range(len(scenarios))
for i, (lo, hi) in enumerate(zip(lows, highs)):
    ax.barh(i, hi - lo, left=lo, height=0.52, color=[ACCENT, ACCENT2, CARD][i],
            edgecolor=[ACCENT, ACCENT2, BORDER][i], linewidth=1.2, zorder=3)
    ax.text(lo - 4000, i, f'${lo//1000}K', ha='right', va='center', fontsize=9, color=TEXTP)
    ax.text(hi + 4000, i, f'${hi//1000}K', ha='left', va='center', fontsize=9, color=TEXTP, fontweight='bold')
ax.set_yticks(list(y)); ax.set_yticklabels(scenarios, fontsize=8.5, color=TEXTP)
ax.set_xlim(-15_000, 285_000)
ax.set_xticks([0, 50_000, 100_000, 150_000, 200_000, 250_000])
ax.set_xticklabels(['$0', '$50K', '$100K', '$150K', '$200K', '$250K'], fontsize=8.5, color=MUTED)
ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
ax.spines['left'].set_visible(False); ax.spines['bottom'].set_color(BORDER)
ax.tick_params(axis='y', length=0)
ax.grid(True, axis='x', linestyle='--', alpha=0.2, linewidth=0.5, zorder=0)
ax.invert_yaxis()
fig.savefig('/home/z/my-project/scripts/chart_scenarios.png', facecolor='white')
plt.close(fig)

# ── Chart 2: Test suite composition (donut, rich legend right) ──
fig, ax = plt.subplots(figsize=(7.6, 3.2), dpi=200, constrained_layout=True)
labels = ['Passing, real assertions (678)', 'Hollow skeletons — zero assertions (~114)', 'Failing (32)']
sizes  = [678, 114, 32]
colors = [ACCENT, CARD, '#a85a5a']
wedges, _ = ax.pie(sizes, colors=colors, startangle=90, counterclock=False,
                   wedgeprops=dict(width=0.34, edgecolor='white', linewidth=1.5))
ax.text(0, 0.05, '824', ha='center', va='center', fontsize=22, fontweight='bold', color=TEXTP)
ax.text(0, -0.22, 'tests', ha='center', va='center', fontsize=9, color=MUTED)
legend_labels = [f'{l}  —  {s}' for l, s in zip(labels, sizes)]
ax.legend(wedges, legend_labels, loc='center left', bbox_to_anchor=(1.02, 0.5),
          frameon=False, fontsize=8.5, labelcolor=TEXTP)
fig.savefig('/home/z/my-project/scripts/chart_tests.png', facecolor='white')
plt.close(fig)

print('charts done')
