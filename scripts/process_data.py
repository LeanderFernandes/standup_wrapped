"""
Standup Data Transformation Pipeline
Converts raw CSV data into structured, lightweight JSON/JS for static web visualization:
1. Team Daily Attendance Tracker (Section 1)
2. Personal Profiles & Retrospective Dynamics (Section 2)
"""

import json
from pathlib import Path
from collections import defaultdict
import pandas as pd
import numpy as np


# Curated Archetypes and Narratives tailored to each member's real standup attendance signature
ARCHETYPES = {
    "Leander": {
        "title": "The Iron Anchor",
        "desc": "The ultimate standup stalwart. Boasts the longest unbroken streak in team history (78 consecutive days) and an astonishing 96.4% turnout rate.",
        "tags": ["#StreakRecord78", "#96PercentClub", "#TeamAnchor"]
    },
    "Matt": {
        "title": "The Consistent Pacer",
        "desc": "A model of rhythmic discipline. Ranks #2 overall with a 62-day attendance streak and 26 appearances setting the morning tone as Speaker #1.",
        "tags": ["#SilverStandard", "#Streak62", "#RhythmKeeper"]
    },
    "Ryan": {
        "title": "The Early Ignition",
        "desc": "Key engine of group momentum. Started standup as Speaker #1 an impressive 31 times while holding down an 88.1% overall attendance rate.",
        "tags": ["#IgnitionP1", "#54DayStreak", "#EarlyStarter"]
    },
    "Sasha": {
        "title": "The Steady Cadence",
        "desc": "Unwavering presence through thick and thin. Kept up an 88.1% attendance rate with a 44-day winter streak and reliable mid-rotation pacing.",
        "tags": ["#SteadyCadence", "#WinterStreak", "#CorePresence"]
    },
    "Ethan": {
        "title": "The Chief Starter",
        "desc": "The undisputed pioneer of standup starts. Led off the morning as Speaker #1 a team-record 32 times with an 87.1% overall record.",
        "tags": ["#RecordStarter", "#P1Pioneer", "#MorningPace"]
    },
    "Michal": {
        "title": "The Precision Driver",
        "desc": "Hit the ground running in April 2025 and locked in a 53-day streak through summer, maintaining an elite 87.1% turnout rate across 264 sessions.",
        "tags": ["#PrecisionTurnout", "#SummerStreak", "#CoreEngine"]
    },
    "Freya": {
        "title": "The Core Connector",
        "desc": "A vibrant hub of team synergy. Present in 261 standups with 28 opening turns as Speaker #1 and strong co-attendance ties across the roster.",
        "tags": ["#CoreConnector", "#P1Veteran", "#TeamSynergy"]
    },
    "Vishal": {
        "title": "The Midfield Constant",
        "desc": "Dependable, composed presence in 257 sessions. A consistent bridge across the roster with a 25-day streak and steady midweek turnout.",
        "tags": ["#MidfieldConstant", "#ReliableTurnout", "#BridgePresence"]
    },
    "Helena": {
        "title": "The Reliable Pulse",
        "desc": "A foundational constant across four seasons. Logged 252 standups with consistent midweek turnout and a strong 31-day streak.",
        "tags": ["#ReliablePulse", "#FourSeasons", "#Foundational"]
    },
    "Rahul": {
        "title": "The Marathon Runner",
        "desc": "Showed remarkable endurance with a team-leading 57-day continuous run across summer 2025, recording 248 total standup appearances.",
        "tags": ["#SummerMarathon", "#57DayRun", "#HighEndurance"]
    },
    "Bhumika": {
        "title": "The Foundational Addition",
        "desc": "The very first addition to the original lineup (joining 30/05/2025). Built instant synergy with 224 sessions and a 26-day initial streak.",
        "tags": ["#FirstJoiner", "#224Sessions", "#InstantImpact"]
    },
    "Will": {
        "title": "The Opening Maverick",
        "desc": "A favorite morning pick. Opened standup as Speaker #1 a remarkable 29 times across 216 sessions, bringing high energy whenever present.",
        "tags": ["#OpeningMaverick", "#29TimesP1", "#HighImpact"]
    },
    "Luke": {
        "title": "The Clutch Finisher",
        "desc": "Saved their strongest run for the final quarter, mounting a 28-day streak into July 2026 and racking up 190 total standup appearances.",
        "tags": ["#ClutchFinisher", "#LateStreak", "#Resilient"]
    },
    "Finn": {
        "title": "The Original Vanguard",
        "desc": "An integral voice of the founding crew. Present across 108 sessions through the team's early chapters before departing in May 2026.",
        "tags": ["#OriginalCrew", "#FoundingVoice", "#EarlyVanguard"]
    },
    "Sam": {
        "title": "The Spring Catalyst",
        "desc": "Arrived in March 2026 with immediate impact. Attended 85 standups over 5 intensive months with an impressive 33-day newcomer streak.",
        "tags": ["#SpringCatalyst", "#NewEraImpact", "#33DayRun"]
    },
    "Pukhraj": {
        "title": "The Summer Surge",
        "desc": "Joined on 12/05/2026 and quickly achieved an unbroken 26-day attendance streak, bringing fresh momentum to the closing 2026 stretch.",
        "tags": ["#SummerSurge", "#FastPaced", "#26DayRun"]
    },
    "Sahil": {
        "title": "The Flawless Starter",
        "desc": "A perfect attendance record! Attended 48 out of 48 standups since joining on 28/05/2026 — never missing a single session to date.",
        "tags": ["#Flawless100", "#Unbroken48", "#NeverMissed"]
    }
}


def build_mistakes(df) -> dict:
    """Mistakes = rows flagged TRUE: the speaker tried to pick someone who had already spoken.

    Exposure-adjusted: the later the turn, the more teammates have already gone, so the more
    likely a slip is. Exposure per turn = (position - 1) / (session_size - 1).
    """
    if 'Mistakes' not in df.columns:
        return {"summary": {"total_mistakes": 0}, "members": [], "monthly": [], "timing": [], "sessions": [], "events": []}

    d = df.copy()
    d['is_mistake'] = d['Mistakes'].astype(str).str.strip().str.upper() == 'TRUE'
    d['session_size'] = d.groupby('parsed_date')['Position'].transform('max')
    # Opportunities: every turn that passes the baton (final speaker has no pick)
    d['has_pick'] = d['Next Picked'].notna() & (d['Next Picked'].astype(str).str.strip() != '')
    turns = d[d['has_pick'] | d['is_mistake']].copy()
    turns['exposure'] = np.where(
        turns['session_size'] > 1,
        (turns['Position'] - 1) / (turns['session_size'] - 1).clip(lower=1),
        0.0)

    total_turns = len(turns)
    total_mistakes = int(turns['is_mistake'].sum())
    total_exposure = float(turns['exposure'].sum()) or 1.0
    team_rate_per_exposure = total_mistakes / total_exposure

    def bucket(frac):
        return 'early' if frac < 1/3 else ('mid' if frac < 2/3 else 'late')

    members = []
    for name, g in turns.groupby('Name'):
        m = g[g['is_mistake']].sort_values('parsed_date')
        n_turns = len(g)
        n_mis = len(m)
        exposure = float(g['exposure'].sum())
        expected = round(exposure * team_rate_per_exposure, 2)
        events = [{
            "date": r['Date'],
            "iso_date": r['parsed_date'].strftime('%Y-%m-%d'),
            "position": int(r['Position']),
            "session_size": int(r['session_size']),
            "next_picked": (r['Next Picked'] if isinstance(r['Next Picked'], str) else None),
        } for _, r in m.iterrows()]
        members.append({
            "name": name,
            "mistakes": n_mis,
            "turns": n_turns,
            "rate_pct": round(n_mis / n_turns * 100, 2) if n_turns else 0.0,
            "expected": expected,
            "diff": round(n_mis - expected, 2),
            "avg_turn_pos": round(float(m['Position'].mean()), 1) if n_mis else None,
            "avg_turn_pct": round(float((m['Position'] / m['session_size']).mean()) * 100, 1) if n_mis else None,
            "last_date": events[-1]['date'] if events else None,
            "events": events,
        })
    members.sort(key=lambda x: (x['mistakes'], x['diff']), reverse=True)

    # Monthly trend
    mm = turns.copy()
    mm['month'] = mm['parsed_date'].dt.strftime('%Y-%m')
    monthly = []
    for mon, g in mm.groupby('month'):
        mis = int(g['is_mistake'].sum())
        monthly.append({
            "month": mon,
            "label": pd.to_datetime(mon + '-01').strftime('%b %Y'),
            "mistakes": mis,
            "turns": len(g),
            "rate_pct": round(mis / len(g) * 100, 2) if len(g) else 0.0,
        })

    # Timing buckets
    turns['bucket'] = ((turns['Position'] - 1) / turns['session_size'].clip(lower=1)).apply(bucket)
    timing = []
    for key, label in (('early', 'Early third'), ('mid', 'Middle third'), ('late', 'Final third')):
        g = turns[turns['bucket'] == key]
        mis = int(g['is_mistake'].sum())
        timing.append({
            "key": key, "label": label, "mistakes": mis, "turns": len(g),
            "rate_pct": round(mis / len(g) * 100, 2) if len(g) else 0.0,
        })

    # Session-level view
    sessions = []
    for (pdate, dstr), g in turns[turns['is_mistake']].groupby(['parsed_date', 'Date']):
        sessions.append({
            "date": dstr,
            "iso_date": pdate.strftime('%Y-%m-%d'),
            "count": len(g),
            "session_size": int(g['session_size'].iloc[0]),
            "offenders": [{"name": r['Name'], "position": int(r['Position'])} for _, r in g.sort_values('Position').iterrows()],
        })
    sessions.sort(key=lambda x: x['iso_date'], reverse=True)

    total_sessions = int(d['parsed_date'].nunique())
    qualified = [m for m in members if m['turns'] >= 20]
    worst_rate = max(qualified, key=lambda x: x['rate_pct']) if qualified else None
    clean = [m['name'] for m in members if m['mistakes'] == 0]
    mistake_free_count = len(clean)
    most_recent = sessions[0] if sessions else None
    worst_session = max(sessions, key=lambda x: (x['count'], x['iso_date'])) if sessions else None

    return {
        "summary": {
            "total_mistakes": total_mistakes,
            "total_turns": total_turns,
            "overall_rate_pct": round(total_mistakes / total_turns * 100, 2) if total_turns else 0.0,
            "sessions_with_mistakes": len(sessions),
            "total_sessions": total_sessions,
            "pct_sessions_with_mistakes": round(len(sessions) / total_sessions * 100, 1) if total_sessions else 0.0,
            "offenders": sum(1 for m in members if m['mistakes'] > 0),
            "mistake_free_count": mistake_free_count,
            "top_offender": members[0] if members and members[0]['mistakes'] else None,
            "worst_rate": worst_rate,
            "most_recent": most_recent,
            "worst_session": worst_session,
            "team_rate_per_exposure": round(team_rate_per_exposure, 4),
        },
        "members": members,
        "monthly": monthly,
        "timing": timing,
        "sessions": sessions,
    }


def process_standup_data(csv_path: str, output_path: str) -> dict:
    df = pd.read_csv(csv_path)

    # Clean and parse dates (DD/MM/YYYY)
    df['parsed_date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y', errors='coerce')
    df = df.dropna(subset=['parsed_date'])

    # 1. Daily Standup Attendance (Chronological)
    daily_groups = df.groupby(['parsed_date', 'Date'])
    
    daily_records = []
    for (parsed_d, date_str), group in daily_groups:
        attendees = sorted(group['Name'].dropna().unique().tolist())
        daily_records.append({
            "iso_date": parsed_d.strftime('%Y-%m-%d'),
            "parsed_date": parsed_d,
            "date": date_str,
            "people_count": len(attendees),
            "speakers_count": int(group['Position'].max()) if pd.notnull(group['Position'].max()) else len(attendees),
            "attendees": attendees
        })

    # Sort strictly chronologically
    daily_records.sort(key=lambda x: x['iso_date'])
    total_standups = len(daily_records)
    session_dates = [r['parsed_date'] for r in daily_records]
    date_to_idx = {r['parsed_date']: i for i, r in enumerate(daily_records)}

    # 2. Standup Size Distribution
    size_counts = {}
    for r in daily_records:
        c = r['people_count']
        size_counts[c] = size_counts.get(c, 0) + 1

    distribution = [
        {"people_count": k, "standup_count": v}
        for k, v in sorted(size_counts.items(), key=lambda x: x[0])
    ]

    # 3. Attendance by Person
    person_counts = df.groupby('Name')['Date'].nunique().sort_values(ascending=False)
    
    attendance_by_person = []
    for name, count in person_counts.items():
        pct = round((count / total_standups) * 100, 1) if total_standups > 0 else 0
        attendance_by_person.append({
            "name": name,
            "attended": int(count),
            "total_standups": total_standups,
            "percentage": pct
        })

    # 4. Day of the Week Breakdown
    weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    weekday_stats = {d: [] for d in weekday_names}
    for r in daily_records:
        d_name = pd.to_datetime(r['iso_date']).day_name()
        if d_name in weekday_stats:
            weekday_stats[d_name].append(r['people_count'])

    weekday_breakdown = []
    for day in weekday_names:
        counts_list = weekday_stats[day]
        avg = round(sum(counts_list) / len(counts_list), 1) if counts_list else 0
        weekday_breakdown.append({
            "day": day,
            "short_day": day[:3],
            "average": avg,
            "count": len(counts_list),
            "min": min(counts_list) if counts_list else 0,
            "max": max(counts_list) if counts_list else 0
        })

    # 5. Team Milestones (Joiners and Leavers)
    milestones = [
        {"type": "joined", "name": "Bhumika", "date": "30/05/2025", "iso_date": "2025-05-30", "label": "Bhumika joined"},
        {"type": "joined", "name": "Sam", "date": "18/03/2026", "iso_date": "2026-03-18", "label": "Sam joined"},
        {"type": "joined", "name": "Pukhraj", "date": "12/05/2026", "iso_date": "2026-05-12", "label": "Pukhraj joined"},
        {"type": "left", "name": "Finn", "date": "28/05/2026", "iso_date": "2026-05-28", "label": "Finn's last day"},
        {"type": "joined", "name": "Sahil", "date": "28/05/2026", "iso_date": "2026-05-28", "label": "Sahil joined"}
    ]

    # 6. Summary KPI metrics
    counts = [r['people_count'] for r in daily_records]
    summary = {
        "total_standups": total_standups,
        "total_unique_participants": len(attendance_by_person),
        "date_range": {
            "start": daily_records[0]['date'] if daily_records else None,
            "end": daily_records[-1]['date'] if daily_records else None,
            "start_iso": daily_records[0]['iso_date'] if daily_records else None,
            "end_iso": daily_records[-1]['iso_date'] if daily_records else None,
        },
        "standup_size": {
            "average": round(sum(counts) / len(counts), 1) if counts else 0,
            "min": min(counts) if counts else 0,
            "max": max(counts) if counts else 0,
            "median": sorted(counts)[len(counts) // 2] if counts else 0
        }
    }

    # 7. SECTION 2: Personal Profiles & Retrospective Dynamics
    all_months = []
    cur_m = pd.Period(daily_records[0]['parsed_date'], freq='M')
    end_m = pd.Period(daily_records[-1]['parsed_date'], freq='M')
    while cur_m <= end_m:
        all_months.append(cur_m)
        cur_m += 1

    month_sessions = {m: [] for m in all_months}
    for r in daily_records:
        m = pd.Period(r['parsed_date'], freq='M')
        month_sessions[m].append(r)

    people = sorted(df['Name'].unique())
    personal_profiles = {}
    session_sizes = df.groupby('Date')['Name'].nunique().to_dict()
    session_attendees = df.groupby('Date')['Name'].apply(set).to_dict()

    for person in people:
        pdf = df[df['Name'] == person]
        p_dates_set = set(pdf['parsed_date'].unique())
        attended_count = len(p_dates_set)
        p_sessions = [r for r in daily_records if person in r['attendees']]

        first_session = p_sessions[0]
        last_session = p_sessions[-1]
        first_date_str = first_session['date']

        # Calculate streaks
        attended_indices = sorted([date_to_idx[r['parsed_date']] for r in p_sessions])
        max_streak = 0
        cur_streak = 0
        s_start = 0
        best_s_start = 0
        best_s_end = 0

        for i in range(len(attended_indices)):
            if i == 0:
                cur_streak = 1
                s_start = attended_indices[i]
            elif attended_indices[i] == attended_indices[i - 1] + 1:
                cur_streak += 1
            else:
                if cur_streak > max_streak:
                    max_streak = cur_streak
                    best_s_start = s_start
                    best_s_end = attended_indices[i - 1]
                cur_streak = 1
                s_start = attended_indices[i]
        if cur_streak > max_streak:
            max_streak = cur_streak
            best_s_start = s_start
            best_s_end = attended_indices[-1]

        streak_start_dt = daily_records[best_s_start]['parsed_date']
        streak_end_dt = daily_records[best_s_end]['parsed_date']
        if streak_start_dt.strftime('%b %Y') == streak_end_dt.strftime('%b %Y'):
            streak_range_str = streak_start_dt.strftime('%b %Y')
        else:
            streak_range_str = f"{streak_start_dt.strftime('%b %Y')} – {streak_end_dt.strftime('%b %Y')}"

        # Speaking consistency / position metrics
        positions = pdf['Position'].dropna()
        p1_count = int((positions == 1).sum())
        avg_pos = round(float(positions.mean()), 1) if len(positions) else 0.0

        # Sessions since joined
        sessions_since_joined = [r for r in daily_records if r['parsed_date'] >= first_session['parsed_date']]
        if person == 'Finn':
            sessions_since_joined = [r for r in sessions_since_joined if r['parsed_date'] <= last_session['parsed_date']]
        eligible_count = len(sessions_since_joined)
        eligible_pct = round(attended_count / eligible_count * 100, 1) if eligible_count > 0 else 0.0
        overall_pct = round(attended_count / total_standups * 100, 1)

        # Day of week breakdown (Mon - Fri)
        weekday_data = []
        best_w_name = "Monday"
        best_w_pct = -1.0
        best_w_attended = 0
        best_w_total = 0

        for w_idx, w_name in enumerate(weekday_names):
            w_sessions = [r for r in sessions_since_joined if r['parsed_date'].weekday() == w_idx]
            w_total = len(w_sessions)
            w_att = sum(1 for r in w_sessions if person in r['attendees'])
            w_pct = round(w_att / w_total * 100, 1) if w_total > 0 else 0.0

            weekday_data.append({
                'day': w_name,
                'short_day': w_name[:3],
                'attended': w_att,
                'total': w_total,
                'pct': w_pct
            })
            if w_pct > best_w_pct:
                best_w_pct = w_pct
                best_w_name = w_name
                best_w_attended = w_att
                best_w_total = w_total

        # Monthly attendance breakdown across all 17 months
        monthly_data = []
        max_month_pct = 0.0

        for m in all_months:
            m_sess = month_sessions[m]
            m_tot = len(m_sess)
            m_att = sum(1 for r in m_sess if person in r['attendees'])
            month_start_dt = m.start_time
            month_end_dt = m.end_time

            is_prior = month_end_dt < first_session['parsed_date']
            is_after = person == 'Finn' and month_start_dt > last_session['parsed_date']

            if is_prior or is_after:
                pct = 0.0
                status = 'inactive'
            else:
                pct = round(m_att / m_tot * 100, 1) if m_tot > 0 else 0.0
                status = 'active'
                if pct > max_month_pct:
                    max_month_pct = pct

            if m.month == 1:
                lbl = m.strftime('%b %y')
            elif m == all_months[0]:
                lbl = m.strftime('%b %y')
            elif m == all_months[-1]:
                lbl = m.strftime('%b %y')
            else:
                lbl = m.strftime('%b')

            monthly_data.append({
                'month': m.strftime('%Y-%m'),
                'label': lbl,
                'attended': m_att,
                'total': m_tot,
                'pct': pct,
                'status': status
            })

        for md in monthly_data:
            md['is_peak'] = (md['status'] == 'active' and md['pct'] >= 98.0 and md['pct'] == max_month_pct)

        # Monthly Observation text
        if person == "Sahil":
            month_footnote = "Flawless record: Maintained an unbroken 100% attendance across all active months since joining in May 2026."
        elif max_month_pct >= 99.0:
            perfect_months = [md['label'] for md in monthly_data if md['status'] == 'active' and md['pct'] >= 99.0]
            month_footnote = f"Achieved a perfect 100% attendance record across {len(perfect_months)} separate calendar months ({', '.join(perfect_months[:4])})."
        else:
            month_footnote = f"Maintained consistent engagement, peaking at {max_month_pct}% attendance with reliable participation across all seasons."

        # Frequent Co-Attendees
        co_counts = {}
        for r in p_sessions:
            for other in r['attendees']:
                if other != person:
                    co_counts[other] = co_counts.get(other, 0) + 1

        co_attendees = []
        for other, count in sorted(co_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
            co_pct = round(count / attended_count * 100, 1) if attended_count > 0 else 0
            co_attendees.append({
                'name': other,
                'shared_count': count,
                'pct': co_pct
            })

        # Dynamic milestones
        milestones_list = []
        if first_session['date'] == daily_records[0]['date']:
            milestones_list.append({
                'date': first_date_str,
                'text': "Day 1: Present at the very first recorded team standup"
            })
        else:
            milestones_list.append({
                'date': first_date_str,
                'text': f"First standup with the team (joined on Session #{date_to_idx[first_session['parsed_date']] + 1})"
            })

        if attended_count >= 100:
            sess_100 = p_sessions[99]
            milestones_list.append({
                'date': sess_100['date'],
                'text': "Crossed the century mark with their 100th attended standup"
            })
        elif attended_count >= 50:
            sess_50 = p_sessions[49]
            milestones_list.append({
                'date': sess_50['date'],
                'text': "Reached the 50th session attendance milestone"
            })

        if max_streak >= 15:
            milestones_list.append({
                'date': daily_records[best_s_end]['date'],
                'text': f"Completed personal-best {max_streak}-day continuous attendance streak"
            })

        if p1_count >= 10:
            first_p1 = pdf[pdf['Position'] == 1].sort_values('parsed_date').iloc[0]
            milestones_list.append({
                'date': first_p1['Date'],
                'text': f"Set the morning pace as Speaker #1 for the first time ({p1_count} career P1 starts)"
            })
        else:
            milestones_list.append({
                'date': last_session['date'],
                'text': f"Logged career standup #{attended_count} as the team concluded recording"
            })

        # Archetype info
        arch = ARCHETYPES.get(person, {
            "title": "The Reliable Regular",
            "desc": f"A dedicated contributor with {attended_count} standups logged across the season.",
            "tags": ["#TeamPlayer", "#StandupWrapped"]
        })

        # Observation quote
        if person == "Sahil":
            quote = "Has not missed a single standup since joining the team on 28/05/2026 (48 of 48 sessions)."
        elif person == "Leander":
            quote = f"Held the team's longest continuous attendance run of 78 consecutive sessions, attending {attended_count} of {total_standups} overall ({overall_pct}%)."
        elif person == "Ethan":
            quote = f"Led off standup as Speaker #1 a team-record 32 times, more than any other team member."
        elif person == "Ryan":
            quote = f"Kicked off standup as Speaker #1 in 31 sessions while achieving an 88.1% overall attendance rate."
        elif person == "Will":
            quote = f"Called on to open standup as Speaker #1 in 29 separate sessions (13.4% of all attended sessions)."
        elif person == "Matt":
            quote = f"Maintained a 90.1% attendance rate across 273 sessions with an unbroken 62-session spring run."
        elif person == "Finn":
            quote = f"Contributed across 108 sessions as a founding member before concluding on 28/05/2026."
        elif person == "Sam":
            quote = f"Maintained an 85.0% attendance rate since joining on 18/03/2026, mounting a 33-session streak."
        elif person == "Pukhraj":
            quote = f"Achieved a 26-day attendance streak within their first three months of joining the team."
        elif person == "Bhumika":
            quote = f"Attended 224 standups as the first new addition to the team in May 2025."
        else:
            quote = f"Attended {attended_count} standups ({overall_pct}% overall), peaking on {best_w_name}s with a {best_w_pct}% turnout rate."

        # Nomination Breakdown (Who this person picked next, weighted by freedom of choice)
        pdf_picks = df[(df['Name'] == person) & (df['Next Picked'].notna()) & (df['Next Picked'] != person)].copy()
        total_picks = len(pdf_picks)

        # Precompute expected picks based on attendee co-presence
        expected_counts = {}
        for _, row in pdf_picks.iterrows():
            d_str = row['Date']
            n_d = session_sizes.get(d_str, 10)
            if n_d > 1:
                prob = 1.0 / (n_d - 1.0)
                for other in session_attendees.get(d_str, set()):
                    if other != person:
                        expected_counts[other] = expected_counts.get(other, 0.0) + prob

        picks_data = {}
        for _, row in pdf_picks.iterrows():
            nominee = row['Next Picked']
            d_str = row['Date']
            k = row['Position']
            n_d = session_sizes.get(d_str, 10)

            if pd.notna(k) and n_d > 2:
                # Freedom score: Position 1 -> 1.0 (100% free choice pool), Position N-1 -> 0.0 (forced pick)
                f_score = max(0.0, min(1.0, (n_d - k - 1.0) / (n_d - 2.0)))
            else:
                f_score = 0.5

            if nominee not in picks_data:
                picks_data[nominee] = {
                    "name": nominee,
                    "raw_count": 0,
                    "weighted_score": 0.0,
                    "freedoms": []
                }
            picks_data[nominee]["raw_count"] += 1
            picks_data[nominee]["weighted_score"] += f_score
            picks_data[nominee]["freedoms"].append(f_score)

        picks_list = []
        for nominee, pinfo in picks_data.items():
            raw_c = pinfo["raw_count"]
            w_score = round(pinfo["weighted_score"], 1)
            avg_f = round((pinfo["weighted_score"] / raw_c) * 100, 1) if raw_c > 0 else 0.0
            raw_pct = round((raw_c / total_picks) * 100, 1) if total_picks > 0 else 0.0
            exp_c = round(expected_counts.get(nominee, 0.0), 1)
            diff_exp = round(raw_c - exp_c, 1)

            if avg_f >= 60.0:
                category = "First Pick"
                category_key = "first-pick"
                emoji = "🎯"
            elif avg_f >= 45.0:
                category = "Mid-Flow"
                category_key = "mid-flow"
                emoji = "🤝"
            else:
                category = "Safety Net"
                category_key = "safety-net"
                emoji = "🪂"

            picks_list.append({
                "name": nominee,
                "count": raw_c,
                "raw_count": raw_c,
                "pct": raw_pct,
                "weighted_score": w_score,
                "expected_picks": exp_c,
                "diff_from_expected": diff_exp,
                "avg_freedom_pct": avg_f,
                "category": category,
                "category_key": category_key,
                "emoji": emoji
            })

        # Normalized relationship tiers based on difference from expected picks (attendance-normalized)
        picks_list.sort(key=lambda x: (x["diff_from_expected"], x["weighted_score"]), reverse=True)

        n_picks = len(picks_list)
        for idx, item in enumerate(picks_list):
            if idx == 0:
                rel = "Office Crush"
                rel_key = "office-crush"
                rel_emoji = "💘"
            elif idx <= 2:
                rel = "Work Bestie"
                rel_key = "work-bestie"
                rel_emoji = "🤝"
            elif idx <= 6:
                rel = "Desk Neighbor"
                rel_key = "desk-neighbor"
                rel_emoji = "☕"
            elif idx < n_picks - 2:
                rel = "Neutral Terms"
                rel_key = "neutral-terms"
                rel_emoji = "👔"
            elif idx < n_picks - 1:
                rel = "Last Resort"
                rel_key = "last-resort"
                rel_emoji = "😬"
            else:
                rel = "Arch Enemy"
                rel_key = "arch-enemy"
                rel_emoji = "⚔️"

            item["relationship"] = rel
            item["relationship_key"] = rel_key
            item["relationship_emoji"] = rel_emoji
            item["category"] = rel
            item["category_key"] = rel_key
            item["emoji"] = rel_emoji

        top_crush = picks_list[0] if picks_list else None
        # Arch enemy is the most avoided relative to expected probability
        arch_enemy = picks_list[-1] if (len(picks_list) > 1 and picks_list[-1]["diff_from_expected"] < 0) else None
        by_raw = sorted(picks_list, key=lambda x: (x["raw_count"], x["weighted_score"]), reverse=True)
        top_raw = by_raw[0] if by_raw else None
        by_weighted = sorted(picks_list, key=lambda x: (x["weighted_score"], x["raw_count"]), reverse=True)
        top_weighted = by_weighted[0] if by_weighted else None

        total_w_score = sum(p["weighted_score"] for p in picks_list)
        avg_overall_freedom = round((total_w_score / total_picks) * 100, 1) if total_picks > 0 else 0.0

        nomination_breakdown = {
            "total_nominations": total_picks,
            "unique_nominees": len(picks_list),
            "top_pick": top_crush,
            "top_crush": top_crush,
            "arch_enemy": arch_enemy,
            "top_weighted_pick": top_crush,
            "top_raw_pick": top_raw,
            "avg_overall_freedom": avg_overall_freedom,
            "top_3": picks_list[:3],
            "all_picks": picks_list
        }

        personal_profiles[person] = {
            'name': person,
            'attended': attended_count,
            'total_standups': total_standups,
            'overall_pct': overall_pct,
            'eligible_standups': eligible_count,
            'eligible_pct': eligible_pct,
            'first_date': first_date_str,
            'is_day_1': (first_session['date'] == daily_records[0]['date']),
            'last_date': last_session['date'],
            'max_streak': max_streak,
            'streak_range': streak_range_str,
            'avg_pos': avg_pos,
            'p1_count': p1_count,
            'peak_day': {
                'name': best_w_name,
                'pct': best_w_pct,
                'attended': best_w_attended,
                'total': best_w_total
            },
            'archetype': arch,
            'weekday_breakdown': weekday_data,
            'monthly_trajectory': monthly_data,
            'monthly_footnote': month_footnote,
            'frequent_co_attendees': co_attendees[:4],
            'milestones': milestones_list[:4],
            'observation_quote': quote,
            'nomination_breakdown': nomination_breakdown,
            '_expected_counts': expected_counts
        }

    # Assign ranks
    sorted_by_att = sorted(personal_profiles.values(), key=lambda x: x['attended'], reverse=True)
    for r, m in enumerate(sorted_by_att, 1):
        personal_profiles[m['name']]['rank'] = r
        personal_profiles[m['name']]['total_members'] = len(people)

    # 8. Team Nomination Heatmap Matrix (Sender -> Receiver)
    all_members = sorted(people)
    matrix_data = {}
    max_matrix_raw = 0
    max_matrix_weighted = 0.0

    for sender in all_members:
        matrix_data[sender] = {}
        sender_picks = personal_profiles[sender]['nomination_breakdown']['all_picks']
        picks_by_receiver = {p['name']: p for p in sender_picks}

        for receiver in all_members:
            if receiver == sender:
                matrix_data[sender][receiver] = None
            elif receiver in picks_by_receiver:
                p_item = picks_by_receiver[receiver]
                raw_c = p_item['raw_count']
                w_sc = p_item['weighted_score']
                if raw_c > max_matrix_raw:
                    max_matrix_raw = raw_c
                if w_sc > max_matrix_weighted:
                    max_matrix_weighted = w_sc
                matrix_data[sender][receiver] = {
                    "raw_count": raw_c,
                    "weighted_score": w_sc,
                    "expected_picks": p_item.get('expected_picks', 0.0),
                    "diff_from_expected": p_item.get('diff_from_expected', 0.0),
                    "avg_freedom_pct": p_item['avg_freedom_pct'],
                    "relationship": p_item.get('relationship', 'Colleague'),
                    "emoji": p_item.get('relationship_emoji', p_item.get('emoji', '🤝'))
                }
            else:
                s_expected = personal_profiles[sender].get('_expected_counts', {}).get(receiver, 0.0)
                exp_c = round(s_expected, 1)
                diff_exp = round(0.0 - exp_c, 1)
                matrix_data[sender][receiver] = {
                    "raw_count": 0,
                    "weighted_score": 0.0,
                    "expected_picks": exp_c,
                    "diff_from_expected": diff_exp,
                    "avg_freedom_pct": 0.0,
                    "relationship": "No Handoffs",
                    "emoji": "—"
                }

    # Clean temporary private keys
    for p in personal_profiles.values():
        p.pop('_expected_counts', None)

    nomination_matrix = {
        "members": all_members,
        "max_raw": max_matrix_raw,
        "max_weighted": round(max_matrix_weighted, 1),
        "matrix": matrix_data
    }

    # 9. Bidirectional Mutual Connections (Section 3: Mutual Chemistry)
    directed_picks = {}
    directed_weights = {}
    for (sender, nominee), group in df.groupby(['Name', 'Next Picked']):
        if pd.notna(nominee) and nominee != sender:
            directed_picks[(sender, nominee)] = len(group)

    for sender, r_dict in matrix_data.items():
        for receiver, cell in r_dict.items():
            if cell:
                directed_weights[(sender, receiver)] = cell.get('weighted_score', 0.0)

    expected_directed = {}
    for sender in all_members:
        s_picks = df[(df['Name'] == sender) & df['Next Picked'].notna() & (df['Next Picked'] != sender)]
        for _, row in s_picks.iterrows():
            d = row['Date']
            n_d = session_sizes.get(d, 10)
            if n_d > 1:
                prob = 1.0 / (n_d - 1.0)
                for other in session_attendees.get(d, set()):
                    if other != sender:
                        expected_directed[(sender, other)] = expected_directed.get((sender, other), 0.0) + prob

    all_pairs = []
    pairs_by_member = {m: [] for m in all_members}

    for i in range(len(all_members)):
        for j in range(i + 1, len(all_members)):
            m1 = all_members[i]
            m2 = all_members[j]
            co_att = sum(1 for d, atts in session_attendees.items() if m1 in atts and m2 in atts)
            
            p12 = directed_picks.get((m1, m2), 0)
            p21 = directed_picks.get((m2, m1), 0)
            total_p = p12 + p21

            w12 = round(directed_weights.get((m1, m2), 0.0), 1)
            w21 = round(directed_weights.get((m2, m1), 0.0), 1)
            total_w = round(w12 + w21, 1)

            exp12 = expected_directed.get((m1, m2), 0.0)
            exp21 = expected_directed.get((m2, m1), 0.0)
            total_exp = round(exp12 + exp21, 1)

            diff = round(total_p - total_exp, 1)
            ratio = round(total_p / total_exp, 2) if total_exp > 0 else (1.0 if total_p == 0 else 9.99)
            balance = round((1.0 - abs(p12 - p21) / total_p) * 100, 1) if total_p > 0 else 0.0

            if diff >= 12.0:
                cat = "Dynamic Duo"
                cat_emoji = "⚡"
            elif diff >= 6.0:
                cat = "Mutual Allies"
                cat_emoji = "🤝"
            elif diff >= 2.0:
                cat = "Work Buddies"
                cat_emoji = "☕"
            elif diff >= -2.0:
                cat = "Standard Teammates"
                cat_emoji = "👔"
            else:
                cat = "Distant Pair"
                cat_emoji = "🧊"

            pair_obj = {
                "id": f"{m1}--{m2}",
                "m1": m1,
                "m2": m2,
                "co_att": co_att,
                "p12": p12,
                "p21": p21,
                "total_picks": total_p,
                "w12": w12,
                "w21": w21,
                "total_weighted": total_w,
                "exp12": round(exp12, 1),
                "exp21": round(exp21, 1),
                "total_expected": total_exp,
                "diff_from_expected": diff,
                "ratio_vs_expected": ratio,
                "balance_pct": balance,
                "category": cat,
                "emoji": cat_emoji
            }

            all_pairs.append(pair_obj)
            pairs_by_member[m1].append(pair_obj)
            pairs_by_member[m2].append(pair_obj)

    all_pairs.sort(key=lambda x: (x["diff_from_expected"], x["total_picks"]), reverse=True)

    for m in all_members:
        pairs_by_member[m].sort(key=lambda x: (x["diff_from_expected"], x["total_picks"]), reverse=True)

    top_duos = all_pairs[:12]
    high_vol = [p for p in all_pairs if p["total_picks"] >= 20]
    most_balanced = sorted(high_vol, key=lambda x: (-x["balance_pct"], -x["total_picks"]))[:8]
    most_unrequited = sorted(high_vol, key=lambda x: (x["balance_pct"], -x["total_picks"]))[:8]

    active_pairs = [p for p in all_pairs if p["total_picks"] >= 5]
    avg_balance = round(sum(p["balance_pct"] for p in active_pairs) / len(active_pairs), 1) if active_pairs else 0.0

    mutual_connections = {
        "pairs": all_pairs,
        "top_duos": top_duos,
        "most_balanced": most_balanced,
        "most_unrequited": most_unrequited,
        "by_member": pairs_by_member,
        "summary": {
            "top_pair": top_duos[0] if top_duos else None,
            "most_balanced_pair": most_balanced[0] if most_balanced else None,
            "most_unrequited_pair": most_unrequited[0] if most_unrequited else None,
            "avg_team_balance": avg_balance,
            "total_pairs": len(all_pairs),
            "positive_affinity_pairs_count": sum(1 for p in all_pairs if p["diff_from_expected"] > 0)
        }
    }

    # 10. SECTION 4: Teacher's Pet Dynamics (Will & Luke)
    teachers = ["Will", "Luke"]
    pet_stats = {}
    for m in all_members:
        pet_stats[m] = {
            "name": m,
            "is_teacher": m in teachers,
            "days_present": 0,
            "opps_will": 0,
            "opps_luke": 0,
            "opps_either": 0,
            "raw_will": 0,
            "raw_luke": 0,
            "raw_total": 0,
            "weighted_will": 0.0,
            "weighted_luke": 0.0,
            "weighted_total": 0.0,
            "expected_will": 0.0,
            "expected_luke": 0.0,
            "expected_total": 0.0,
            "freedoms": [],
            "positions": [],
            "early_picks": 0,
            "mid_picks": 0,
            "late_picks": 0
        }

    for (parsed_d, date_str), g in daily_groups:
        n_d = len(g)
        names_in_session = set(g['Name'].dropna().unique())
        positions = dict(zip(g['Name'], g['Position']))
        next_picks = dict(zip(g['Name'], g['Next Picked']))

        for m in all_members:
            if m not in names_in_session:
                continue
            pet_stats[m]['days_present'] += 1
            pos_m = positions.get(m)
            if pos_m is None or pos_m == n_d:
                continue

            pick_m = next_picks.get(m)
            remaining_count = n_d - pos_m

            will_opp = ('Will' in names_in_session) and (positions.get('Will', 0) > pos_m) and (m != 'Will')
            luke_opp = ('Luke' in names_in_session) and (positions.get('Luke', 0) > pos_m) and (m != 'Luke')
            either_opp = will_opp or luke_opp

            if will_opp:
                pet_stats[m]['opps_will'] += 1
                pet_stats[m]['expected_will'] += (1.0 / remaining_count)

            if luke_opp:
                pet_stats[m]['opps_luke'] += 1
                pet_stats[m]['expected_luke'] += (1.0 / remaining_count)

            if either_opp:
                pet_stats[m]['opps_either'] += 1
                avail_teachers = (1 if will_opp else 0) + (1 if luke_opp else 0)
                pet_stats[m]['expected_total'] += (avail_teachers / remaining_count)

            f_score = max(0.0, min(1.0, (n_d - pos_m - 1.0) / (n_d - 2.0))) if n_d > 2 else 0.5

            if pos_m <= 3:
                bucket = 'early'
            elif pos_m >= n_d - 2:
                bucket = 'late'
            else:
                bucket = 'mid'

            is_teacher_pick = False
            if pick_m == 'Will' and m != 'Will':
                pet_stats[m]['raw_will'] += 1
                pet_stats[m]['weighted_will'] += f_score
                is_teacher_pick = True
            elif pick_m == 'Luke' and m != 'Luke':
                pet_stats[m]['raw_luke'] += 1
                pet_stats[m]['weighted_luke'] += f_score
                is_teacher_pick = True

            if is_teacher_pick:
                pet_stats[m]['raw_total'] += 1
                pet_stats[m]['weighted_total'] += f_score
                pet_stats[m]['freedoms'].append(f_score)
                pet_stats[m]['positions'].append(pos_m)
                if bucket == 'early':
                    pet_stats[m]['early_picks'] += 1
                elif bucket == 'mid':
                    pet_stats[m]['mid_picks'] += 1
                else:
                    pet_stats[m]['late_picks'] += 1

    pet_members = []
    for m in all_members:
        d = pet_stats[m]
        diff_tot = round(d['raw_total'] - d['expected_total'], 1)
        diff_w = round(d['raw_will'] - d['expected_will'], 1)
        diff_l = round(d['raw_luke'] - d['expected_luke'], 1)
        rate = round(d['raw_total'] / d['opps_either'] * 100, 1) if d['opps_either'] > 0 else 0.0
        rate_w = round(d['raw_will'] / d['opps_will'] * 100, 1) if d['opps_will'] > 0 else 0.0
        rate_l = round(d['raw_luke'] / d['opps_luke'] * 100, 1) if d['opps_luke'] > 0 else 0.0
        avg_f = round(sum(d['freedoms']) / len(d['freedoms']) * 100, 1) if d['freedoms'] else 0.0
        avg_p = round(sum(d['positions']) / len(d['positions']), 1) if d['positions'] else 0.0
        ratio = round(d['raw_total'] / d['expected_total'], 2) if d['expected_total'] > 0 else 0.0

        if m in teachers:
            other_t = "Luke" if m == "Will" else "Will"
            picks_other = d['raw_luke'] if m == "Will" else d['raw_will']
            badge = "👔 Faculty Member"
            title = "Faculty Member"
            desc = f"Leadership peer. Handed the baton off to fellow faculty member {other_t} {picks_other} times."
        elif d['raw_total'] == 0:
            badge = "🛡️ The Untouchable"
            title = "The Untouchable"
            desc = f"Zero picks for Will or Luke across {d['opps_either']} active picking opportunities. Fully teacher-free independence."
        elif diff_tot <= -15.0:
            badge = "⚔️ The Class Rebel"
            title = "The Class Rebel"
            desc = f"Actively avoids calling on teachers (picked {d['raw_total']} vs {round(d['expected_total'], 1)} expected, diff {diff_tot}). Only a {rate}% conversion rate despite {d['opps_either']} opportunities."
        elif diff_l >= 5.0 and d['raw_luke'] >= 15:
            badge = "👑 Luke Loyalist"
            title = "Luke Loyalist"
            desc = f"Strong affinity for Luke (+{diff_l} above expected, {d['raw_luke']} picks). Converts {rate}% of all teacher opportunities."
        elif diff_w >= 2.0 and d['raw_will'] >= 15:
            badge = "🎯 Will Enthusiast"
            title = "Will Enthusiast"
            desc = f"Go-to baton handoff for Will (+{diff_w} above expected, {d['raw_will']} picks). Consistently reliable morning connection."
        elif ratio >= 1.25 and d['opps_either'] < 50:
            badge = "🍎 Eager Newcomer"
            title = "Eager Newcomer"
            desc = f"Highest opportunity affinity! Picks teachers {ratio}x more often than random chance ({rate}% conversion, {avg_f}% average freedom)."
        elif diff_tot >= 1.5:
            badge = "🌟 Star Pupil"
            title = "Star Pupil"
            desc = f"Front-row regular who actively passes the baton to leadership (+{diff_tot} over expected, {d['raw_total']} career teacher picks)."
        elif abs(diff_tot) < 3.5:
            badge = "☕ Diplomatic Regular"
            title = "Diplomatic Regular"
            desc = f"Balanced engagement with leadership ({d['raw_total']} picks vs {round(d['expected_total'], 1)} expected). Handoffs closely match co-attendance baseline."
        elif diff_tot < -5.0:
            badge = "🧊 Teacher Avoider"
            title = "Teacher Avoider"
            desc = f"Leaves teachers for the end or chooses other teammates ({diff_tot} vs expected). Average pick freedom: {avg_f}%."
        else:
            badge = "👔 Neutral Observer"
            title = "Neutral Observer"
            desc = f"Steady, unswayed handoff record ({d['raw_total']} picks across {d['opps_either']} opportunities)."

        fav_t = "Luke" if diff_l > diff_w else ("Will" if diff_w > diff_l else "Balanced")

        pet_members.append({
            "name": m,
            "is_teacher": m in teachers,
            "badge": badge,
            "title": title,
            "description": desc,
            "days_present": d['days_present'],
            "opps_either": d['opps_either'],
            "opps_will": d['opps_will'],
            "opps_luke": d['opps_luke'],
            "raw_total": d['raw_total'],
            "raw_will": d['raw_will'],
            "raw_luke": d['raw_luke'],
            "weighted_total": round(d['weighted_total'], 1),
            "weighted_will": round(d['weighted_will'], 1),
            "weighted_luke": round(d['weighted_luke'], 1),
            "expected_total": round(d['expected_total'], 1),
            "expected_will": round(d['expected_will'], 1),
            "expected_luke": round(d['expected_luke'], 1),
            "diff_total": diff_tot,
            "diff_will": diff_w,
            "diff_luke": diff_l,
            "conversion_rate": rate,
            "rate_will": rate_w,
            "rate_luke": rate_l,
            "ratio_vs_expected": ratio,
            "avg_freedom_pct": avg_f,
            "avg_turn_pos": avg_p,
            "early_picks": d['early_picks'],
            "mid_picks": d['mid_picks'],
            "late_picks": d['late_picks'],
            "favorite_teacher": fav_t
        })

    # Sort leaderboard by diff_total descending (excluding teachers for main rank, then append teachers)
    non_teachers = [m for m in pet_members if not m['is_teacher']]
    non_teachers.sort(key=lambda x: (x['diff_total'], x['weighted_total']), reverse=True)
    teachers_list = [m for m in pet_members if m['is_teacher']]
    teachers_list.sort(key=lambda x: (x['diff_total'], x['weighted_total']), reverse=True)

    for rank, item in enumerate(non_teachers, 1):
        item['rank'] = rank

    teachers_pet = {
        "teachers": teachers,
        "summary": {
            "total_teacher_picks": sum(m['raw_total'] for m in non_teachers),
            "top_pet": non_teachers[0] if non_teachers else None,
            "top_opportunity_affinity": max(non_teachers, key=lambda x: x['ratio_vs_expected']) if non_teachers else None,
            "class_rebel": min(non_teachers, key=lambda x: x['diff_total']) if non_teachers else None,
            "untouchable": next((m for m in non_teachers if m['raw_total'] == 0), None),
            "mutual_faculty": {
                "will_to_luke": pet_stats['Will']['raw_luke'],
                "luke_to_will": pet_stats['Luke']['raw_will']
            }
        },
        "leaderboard": non_teachers + teachers_list,
        "members": pet_members
    }

    # -------------------------------------------------------------
    # 11. Recurring Baton Chains (Strings of 3+ that repeat >= 2 times)
    # -------------------------------------------------------------
    raw_chains = defaultdict(list)
    df_sorted = df.sort_values(['parsed_date', 'Position'])
    
    for (p_date, d_str), grp in df_sorted.groupby(['parsed_date', 'Date'], sort=False):
        spk = grp['Name'].dropna().tolist()
        iso_d = p_date.strftime('%Y-%m-%d')
        n_spk = len(spk)
        for l in range(3, n_spk + 1):
            for i in range(n_spk - l + 1):
                sub = tuple(spk[i:i+l])
                raw_chains[sub].append({
                    "date": d_str,
                    "iso_date": iso_d,
                    "start_pos": i + 1,
                    "session_size": n_spk
                })

    repeated_dict = {k: v for k, v in raw_chains.items() if len(v) >= 2}
    chain_dates = {c: set(o['date'] for o in occs) for c, occs in repeated_dict.items()}
    all_repeated = list(repeated_dict.keys())

    is_maximal = {}
    for c in all_repeated:
        len_c = len(c)
        dates_c = chain_dates[c]
        subsumed = False
        for other in all_repeated:
            if len(other) > len_c:
                for idx in range(len(other) - len_c + 1):
                    if other[idx:idx+len_c] == c:
                        if dates_c.issubset(chain_dates[other]):
                            subsumed = True
                            break
                if subsumed:
                    break
        is_maximal[c] = not subsumed

    chains_list = []
    initiators = defaultdict(int)
    finishers = defaultdict(int)
    participants = defaultdict(int)

    for c, occs in repeated_dict.items():
        cnt = len(occs)
        initiators[c[0]] += cnt
        finishers[c[-1]] += cnt
        for m in c:
            participants[m] += cnt

        avg_pos = round(sum(o['start_pos'] for o in occs) / cnt, 1)
        chains_list.append({
            "id": "-".join(c).lower().replace(" ", ""),
            "members": list(c),
            "length": len(c),
            "count": cnt,
            "occurrences": sorted(occs, key=lambda x: x['iso_date']),
            "avg_start_pos": avg_pos,
            "is_maximal": is_maximal[c],
            "initiator": c[0],
            "finisher": c[-1]
        })

    chains_list.sort(key=lambda x: (x['count'], x['length'], -x['avg_start_pos']), reverse=True)

    # -------------------------------------------------------------
    # Reversible / Undirected Grouping: A -> B -> C grouped with C -> B -> A
    # -------------------------------------------------------------
    reversible_dict = defaultdict(lambda: {'fwd_occs': [], 'rev_occs': []})
    for c, occs in raw_chains.items():
        rev = tuple(reversed(c))
        canon = min(c, rev)
        if c == canon:
            reversible_dict[canon]['fwd_occs'].extend(occs)
        else:
            reversible_dict[canon]['rev_occs'].extend(occs)

    rev_groups = {k: v for k, v in reversible_dict.items() if (len(v['fwd_occs']) + len(v['rev_occs'])) >= 2}
    group_dates = {c: set(o['date'] for o in g['fwd_occs'] + g['rev_occs']) for c, g in rev_groups.items()}
    all_groups = list(rev_groups.keys())

    is_group_maximal = {}
    for c in all_groups:
        len_c = len(c)
        dates_c = group_dates[c]
        subsumed = False
        for other in all_groups:
            if len(other) > len_c:
                for idx in range(len(other) - len_c + 1):
                    sub_slice = other[idx:idx+len_c]
                    if sub_slice == c or sub_slice == tuple(reversed(c)):
                        if dates_c.issubset(group_dates[other]):
                            subsumed = True
                            break
                if subsumed:
                    break
        is_group_maximal[c] = not subsumed

    grouped_chains_list = []
    for canon, g in rev_groups.items():
        fwd_cnt = len(g['fwd_occs'])
        rev_cnt = len(g['rev_occs'])
        tot = fwd_cnt + rev_cnt
        all_occs = g['fwd_occs'] + g['rev_occs']
        all_occs.sort(key=lambda x: x['iso_date'])
        avg_pos = round(sum(o['start_pos'] for o in all_occs) / tot, 1)

        grouped_chains_list.append({
            "id": "rev-" + "-".join(canon).lower().replace(" ", ""),
            "members": list(canon),
            "length": len(canon),
            "total_count": tot,
            "fwd_count": fwd_cnt,
            "rev_count": rev_cnt,
            "is_bidirectional": (fwd_cnt > 0 and rev_cnt > 0),
            "fwd_occurrences": sorted(g['fwd_occs'], key=lambda x: x['iso_date']),
            "rev_occurrences": sorted(g['rev_occs'], key=lambda x: x['iso_date']),
            "occurrences": all_occs,
            "avg_start_pos": avg_pos,
            "is_maximal": is_group_maximal[canon]
        })

    grouped_chains_list.sort(key=lambda x: (x['total_count'], x['length'], -x['avg_start_pos']), reverse=True)

    # -------------------------------------------------------------
    # Cluster / Co-occurring Grouping (Order-Independent Sets of People)
    # Includes A->B->C, B->C->A, C->A->B, and all reverse permutations
    # -------------------------------------------------------------
    raw_clusters = defaultdict(list)
    for c, occs in raw_chains.items():
        if len(set(c)) == len(c):  # distinct people in the chain window
            c_key = tuple(sorted(set(c)))
            raw_clusters[c_key].extend([dict(o, sequence=c) for o in occs])

    rep_clusters = {k: v for k, v in raw_clusters.items() if len(v) >= 2}
    cluster_dates = {k: set(o['date'] for o in v) for k, v in rep_clusters.items()}
    all_cluster_keys = list(rep_clusters.keys())

    is_cluster_maximal = {}
    for mem_c in all_cluster_keys:
        dates_c = cluster_dates[mem_c]
        set_c = set(mem_c)
        len_c = len(mem_c)
        subsumed = False
        for mem_o in all_cluster_keys:
            if len(mem_o) > len_c:
                if set_c.issubset(set(mem_o)):
                    if dates_c.issubset(cluster_dates[mem_o]):
                        subsumed = True
                        break
        is_cluster_maximal[mem_c] = not subsumed

    cluster_groups_list = []
    for mems, occs in rep_clusters.items():
        tot = len(occs)
        all_sorted = sorted(occs, key=lambda x: x['iso_date'])
        avg_pos = round(sum(o['start_pos'] for o in all_sorted) / tot, 1)

        # Count occurrences per distinct permutation order
        perm_dict = defaultdict(list)
        for o in all_sorted:
            seq_tuple = o['sequence']
            perm_dict[seq_tuple].append(o)

        perm_list = []
        for seq_tuple, p_occs in perm_dict.items():
            perm_list.append({
                "sequence": list(seq_tuple),
                "sequence_str": " → ".join(seq_tuple),
                "count": len(p_occs),
                "occurrences": p_occs
            })
        perm_list.sort(key=lambda x: x['count'], reverse=True)

        cluster_groups_list.append({
            "id": "cluster-" + "-".join(mems).lower().replace(" ", ""),
            "members": list(mems),
            "length": len(mems),
            "total_count": tot,
            "distinct_orders_count": len(perm_list),
            "permutations": perm_list,
            "top_permutation": perm_list[0] if perm_list else None,
            "occurrences": all_sorted,
            "avg_start_pos": avg_pos,
            "is_maximal": is_cluster_maximal[mems]
        })

    cluster_groups_list.sort(key=lambda x: (x['total_count'], x['length'], -x['avg_start_pos']), reverse=True)

    longest_runs = [c for c in chains_list if c['length'] >= 5 and c['is_maximal']]
    longest_runs.sort(key=lambda x: (x['length'], x['count']), reverse=True)

    trios = [c for c in chains_list if c['length'] == 3]
    quartets = [c for c in chains_list if c['length'] == 4]
    record_run = longest_runs[0] if longest_runs else (quartets[0] if quartets else (trios[0] if trios else None))

    top_grouped = grouped_chains_list[0] if grouped_chains_list else None
    top_cluster = cluster_groups_list[0] if cluster_groups_list else None

    recurring_chains = {
        "summary": {
            "total_chains": len(chains_list),
            "total_maximal": sum(1 for c in chains_list if c['is_maximal']),
            "total_trios": len(trios),
            "total_quartets": len(quartets),
            "total_long_runs": sum(1 for c in chains_list if c['length'] >= 5),
            "max_length": max(c['length'] for c in chains_list) if chains_list else 0,
            "max_frequency": max(c['count'] for c in chains_list) if chains_list else 0,
            "top_trio": trios[0] if trios else None,
            "record_run": record_run,
            "mirror_standup": record_run,
            "top_initiator": sorted(initiators.items(), key=lambda x: x[1], reverse=True)[0] if initiators else None,
            "top_finisher": sorted(finishers.items(), key=lambda x: x[1], reverse=True)[0] if finishers else None,
            "top_participant": sorted(participants.items(), key=lambda x: x[1], reverse=True)[0] if participants else None,
            "total_grouped_chains": len(grouped_chains_list),
            "total_bidirectional": sum(1 for g in grouped_chains_list if g['is_bidirectional']),
            "top_grouped_chain": top_grouped,
            "total_clusters": len(cluster_groups_list),
            "top_cluster": top_cluster
        },
        "longest_runs": longest_runs[:15],
        "chains": chains_list,
        "grouped_chains": grouped_chains_list,
        "cluster_groups": cluster_groups_list
    }

    # Clean daily_records before serialization (remove non-serializable parsed_date)
    for r in daily_records:
        r.pop('parsed_date', None)

    # -------------------------------------------------------------
    # 12. Mistakes: speaker tried to pick someone who had already gone
    # -------------------------------------------------------------
    mistakes_payload = build_mistakes(df)

    payload = {
        "summary": summary,
        "daily_standups": daily_records,
        "size_distribution": distribution,
        "attendance_by_person": attendance_by_person,
        "weekday_breakdown": weekday_breakdown,
        "team_milestones": milestones,
        "personal_profiles": personal_profiles,
        "nomination_matrix": nomination_matrix,
        "mutual_connections": mutual_connections,
        "teachers_pet": teachers_pet,
        "recurring_chains": recurring_chains,
        "mistakes": mistakes_payload
    }

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)

    # Also export standup_metrics.js as window.STANDUP_METRICS so file:// works without a web server
    js_file = out_file.with_suffix('.js')
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write("window.STANDUP_METRICS = " + json.dumps(payload, indent=2) + ";\n")

    print(f"Processed {total_standups} standups with {len(attendance_by_person)} unique people.")
    print(f"Generated personal profiles for {len(personal_profiles)} members.")
    print(f"Output saved to {output_path} and {js_file}")
    return payload


if __name__ == '__main__':
    csv_file = Path(__file__).resolve().parent.parent / 'data' / 'standup_data.csv'
    json_file = Path(__file__).resolve().parent.parent / 'data' / 'standup_metrics.json'
    process_standup_data(str(csv_file), str(json_file))
