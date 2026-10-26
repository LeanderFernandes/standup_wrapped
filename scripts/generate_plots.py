"""
Standup Attendance Plot Generator (Minimal 5-Color Palette)
Colors:
  Yale Blue:      #003c57
  Eggshell:       #f4eddb
  Strawberry Red: #e83f40
  Pacific Blue:   #43bccd
  Jungle Teal:    #679289
"""

from pathlib import Path
import json
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import pandas as pd


def generate_attendance_plot(json_path: str, output_image_path: str):
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    daily = data['daily_standups']
    distribution = data['size_distribution']

    df = pd.DataFrame(daily)
    df['parsed_date'] = pd.to_datetime(df['iso_date'])
    df = df.sort_values('parsed_date')
    df['rolling_avg'] = df['people_count'].rolling(window=10, min_periods=1).mean()

    # 5-color palette constants
    YALE_BLUE = '#003c57'
    EGGSHELL = '#f4eddb'
    STRAWBERRY_RED = '#e83f40'
    PACIFIC_BLUE = '#43bccd'
    JUNGLE_TEAL = '#679289'

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 7.5), gridspec_kw={'height_ratios': [2, 1]})
    fig.patch.set_facecolor(EGGSHELL)
    ax1.set_facecolor('#ffffff')
    ax2.set_facecolor('#ffffff')

    for ax in (ax1, ax2):
        for spine in ax.spines.values():
            spine.set_color(YALE_BLUE)
            spine.set_linewidth(1.2)

    # Top: Daily attendance timeline
    ax1.plot(df['parsed_date'], df['people_count'], color=PACIFIC_BLUE, alpha=0.5, linewidth=1.2, label='Daily Headcount')
    ax1.scatter(df['parsed_date'], df['people_count'], color=YALE_BLUE, s=12, alpha=0.7)
    ax1.plot(df['parsed_date'], df['rolling_avg'], color=STRAWBERRY_RED, linewidth=2.4, label='10-Day Moving Average')

    ax1.set_title('Daily Standup Attendance (09/04/2025 - 04/09/2026)', fontsize=14, pad=10, fontweight='bold', color=YALE_BLUE)
    ax1.set_ylabel('Number of People', fontsize=11, color=YALE_BLUE, fontweight='bold')
    ax1.grid(True, linestyle=':', alpha=0.35, color=YALE_BLUE)
    ax1.legend(loc='lower left', framealpha=0.9, facecolor=EGGSHELL, edgecolor=YALE_BLUE, fontsize=10)
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
    ax1.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
    ax1.tick_params(colors=YALE_BLUE)
    ax1.set_ylim(0, max(df['people_count']) + 2)

    avg_val = data['summary']['standup_size']['average']
    total_standups = data['summary']['total_standups']
    ax1.text(0.98, 0.93, f'Total Standups: {total_standups}\nAverage Size: {avg_val} people',
             transform=ax1.transAxes, verticalalignment='top', horizontalalignment='right',
             bbox=dict(boxstyle='square,pad=0.5', facecolor=EGGSHELL, edgecolor=YALE_BLUE, linewidth=1),
             fontsize=9.5, color=YALE_BLUE, fontweight='bold')

    # Bottom: Size frequency distribution
    sizes = [d['people_count'] for d in distribution]
    counts = [d['standup_count'] for d in distribution]
    bar_colors = [PACIFIC_BLUE if (s == 11 or s == 12) else JUNGLE_TEAL for s in sizes]
    bars = ax2.bar(sizes, counts, color=bar_colors, edgecolor=YALE_BLUE, linewidth=1, width=0.65)
    
    ax2.set_title('Standup Size Frequency Distribution', fontsize=12, pad=8, fontweight='bold', color=YALE_BLUE)
    ax2.set_xlabel('Number of People in Standup', fontsize=10.5, color=YALE_BLUE, fontweight='bold')
    ax2.set_ylabel('Frequency (Days)', fontsize=10.5, color=YALE_BLUE, fontweight='bold')
    ax2.set_xticks(sizes)
    ax2.tick_params(colors=YALE_BLUE)
    ax2.grid(True, linestyle=':', alpha=0.35, axis='y', color=YALE_BLUE)

    for bar in bars:
        h = bar.get_height()
        ax2.annotate(f'{h}',
                     xy=(bar.get_x() + bar.get_width() / 2, h),
                     xytext=(0, 2), textcoords="offset points",
                     ha='center', va='bottom', fontsize=8.5, color=YALE_BLUE, fontweight='bold')

    plt.tight_layout()
    out_p = Path(output_image_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_p, dpi=200, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()
    print(f"Minimal plot saved to: {output_image_path}")


if __name__ == '__main__':
    data_json = Path(__file__).resolve().parent.parent / 'data' / 'standup_metrics.json'
    img_out = Path(__file__).resolve().parent.parent / 'data' / 'standup_attendance_plot.png'
    generate_attendance_plot(str(data_json), str(img_out))
