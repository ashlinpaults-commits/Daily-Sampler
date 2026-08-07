from __future__ import annotations

import json
import re
import tempfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import openpyxl


ROOT = Path(__file__).resolve().parent
PORT = 8765

TARGET_AGENTS = [
    "Goutham J",
    "Karthik Rajimon",
    "Kaushik K",
    "Midhun Mohan",
    "Nithil Louis Boban",
    "Rohith R",
    "Vishnu Suresh",
]
AGENT_ALIAS = {
    "presanth b": "Midhun Mohan",
    "adheena i sivan": "Midhun Mohan",
}

AGENT_LOOKUP = {agent.lower(): agent for agent in TARGET_AGENTS}

# Feature 14 - Debug Mode. Set True to print a per-ticket score breakdown to stdout.
DEBUG_SCORING = False


# ---------------------------------------------------------------------------
# Feature 8 - Configurable Scores (no magic numbers)
# ---------------------------------------------------------------------------
LONG_CHAT_SCORE = 35
LONG_CALL_SCORE = 35
BACKUP_CALL_SCORE = 22
LOW_CSAT_SCORE = 28
BLANK_MODULE_SCORE = 18
BLANK_FEATURE_SCORE = 18
BLANK_ORGANIZATION_SCORE = 20
JIRA_REQUIRED_SCORE = 40
HEADER_SCORE = 30
STATUS_SCORE = 25
CHANNEL_PRIORITY_SCORE = 8
SUSPICIOUS_CALL_SCORE = 45
DURATION_MISMATCH_SCORE = 30
MISSING_HOLD_REASON_SCORE = 32
SOLVED_HOUR_BLANK_WITH_HOLD_SCORE = 10

# ---------------------------------------------------------------------------
# Feature 9 - Configurable Thresholds
# ---------------------------------------------------------------------------
IDEAL_CHAT_MINUTES = 12
IDEAL_CALL_MINUTES = 15
BACKUP_CALL_MINUTES = 10
SUSPICIOUS_CALL_MINUTES = 2
DURATION_MISMATCH_THRESHOLD = 3

CHAT_LONG_MARKERS = (f">{IDEAL_CHAT_MINUTES}", f"{IDEAL_CHAT_MINUTES}+")

# ---------------------------------------------------------------------------
# Feature 10 - Configurable Lists
# ---------------------------------------------------------------------------
JIRA_REQUIRED_TYPES = {
    "incident/system error",
    "feature request",
}

JIRA_TAG_KEYWORDS = ("jira", "jra")
MERGE_TAG = "closed_by_merge"

STATUS_REQUIRES_HOLD_REASON = {"open", "pending", "on hold"}

PRIORITY_CHANNELS = {"Chat", "Voice"}

DEFAULT_CHAT_SUBJECTS = ("conversation with",)
DEFAULT_VOICE_SUBJECTS = ("call with", "missed call", "dropped call", "abandoned call")
DEFAULT_EMAIL_SUBJECTS = ("google form has a new response",)
SUSPICIOUS_CALL_TYPES = ("dropped call", "missed call", "abandoned call")

# Filenames / timestamps / attachments - auto-generated, expected subjects.
HEADER_PATTERNS = (
    r"\.(png|jpe?g|gif|bmp|webp|pdf|docx?|xlsx?|csv|txt|mp3|mp4|wav|mov)$",
    r"^\d{4}[-_]\d{2}[-_]\d{2}[\s_t]\d{2}[-:]\d{2}",
    r"^img[_-]?\d+",
    r"^screenshot",
    r"^attachment",
)

# Junk subjects that should never pass as a valid "Module - Description" header,
# even if they happen to contain a hyphen.
BAD_HEADER_PATTERNS = (
    r"^n/?a\b",
    r"^test\d*\b",
    r"^untitled\b",
    r"^\(no subject\)",
    r"^re:\s*$",
)

MODULE_DESCRIPTION_PATTERN = re.compile(r"^[^-]{2,80}-\s*\S.*$")

# Feature 7 - fixed Requirement Check display order. Anything not listed here
# is appended afterwards, in the order it was generated.
CHECK_ORDER = [
    "Jira Required",
    "Low CSAT",
    "Status requires Hold Reason",
    "Blank Module",
    "Blank Feature",
    "Blank Organization",
    "Header Issue",
    "Duration Mismatch",
    "Long Chat",
    "Long Call",
]

# Feature 11 - human-readable labels used when explaining why a ticket ranked highly.
# Tags mapped to None are internal/administrative and excluded from the explanation.
PRIORITY_EXPLANATION_LABELS = {
    "Jira Missing": "Missing Jira",
    "Low CSAT": "Low CSAT",
    "Blank Module": "Blank Module",
    "Blank Feature": "Blank Feature",
    "Missing Org": "Blank Organization",
    "Header Issue": "Header Issue",
    "Long Chat": "Long Chat",
    "Long Call": "Long Call",
    "Usable Call": "Usable Call Length",
    "Status Hold Missing": "Status Missing Hold Reason",
    "Missing Hold Reason": "Missing Hold Reason",
    "Suspicious Call": "Suspicious Call Duration",
    "Duration Mismatch": "Call Duration Mismatch",
    "Channel Priority": None,
}


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------
def clean(value):
    if value is None:
        return ""
    return str(value).replace("\xa0", " ").strip()


def normalize_ticket_id(value):
    """Collapse openpyxl float artifacts (e.g. '1001.0') so numeric and text
    Ticket ID cells match the same dedup key."""
    text = clean(value)
    if not text:
        return ""
    if re.match(r"^\d+\.0$", text):
        text = text[:-2]
    return text


def format_date(value):
    if isinstance(value, datetime):
        return value.strftime("%m/%d/%Y")
    text = clean(value)
    if not text:
        return ""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(text, fmt).strftime("%m/%d/%Y")
        except ValueError:
            continue
    return text


def sort_date_ordinal(formatted_date):
    """Feature 12 tie-breaker helper. Returns 0 (lowest priority) if unparsable."""
    text = clean(formatted_date)
    if not text:
        return 0
    try:
        return datetime.strptime(text, "%m/%d/%Y").toordinal()
    except ValueError:
        return 0


def is_blank(value):
    text = clean(value)
    return text == "" or text.lower() in {"n/a", "na", "none", "null", "-"}


def sheet_channel(sheet_name):
    lowered = sheet_name.lower()
    if "chat" in lowered:
        return "Chat"
    if "voice" in lowered or "call" in lowered:
        return "Voice"
    if "email" in lowered:
        return "Email"
    return sheet_name


def pick(row, *names):
    lowered = {key.lower(): value for key, value in row.items()}
    for name in names:
        if name.lower() in lowered:
            return lowered[name.lower()]
    return ""


def parse_float(value):
    text = clean(value)
    if not text:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


def is_unsatisfied(value):
    text = clean(value).lower()
    if not text:
        return False
    if any(word in text for word in ["unsat", "bad", "poor", "negative", "dissatisfied"]):
        return True
    number = parse_float(text)
    return number is not None and number <= 2


def status_tag(label, active):
    return {"label": label, "active": active}


def get_hold_reason_tags(value):
    text = clean(value).lower()
    if not text or text in {"n/a", "na", "none", "null", "-"}:
        return []
    tags = []
    if "client requested" in text or "customer requested" in text:
        tags.append("Client Requested")
    if "client follow" in text or "customer follow" in text:
        tags.append("Client Follow Up")
    if "internal follow" in text:
        tags.append("Internal Follow Up")
    if "sme" in text or "subject matter expert" in text or "need assistance" in text:
        tags.append("SME Assistance")
    return tags


def parse_tags(value):
    text = clean(value).lower()
    if not text:
        return []
    return [tag.strip() for tag in re.split(r"[,;|]", text) if tag.strip()]


def has_jira_tag(tags):
    return any(any(keyword in tag for keyword in JIRA_TAG_KEYWORDS) for tag in tags)


def has_merge_tag(tags):
    return any(MERGE_TAG in tag.replace(" ", "_").replace("-", "_") for tag in tags)


# ---------------------------------------------------------------------------
# Feature 4 - Subject Intelligence
# ---------------------------------------------------------------------------
def starts_with_any(lowered, prefixes):
    return any(lowered.startswith(prefix) for prefix in prefixes)


def contains_any(lowered, fragments):
    return any(fragment in lowered for fragment in fragments)


def is_bad_header(lowered):
    return any(re.search(pattern, lowered) for pattern in BAD_HEADER_PATTERNS)


def looks_like_generated_header(lowered):
    return any(re.search(pattern, lowered) for pattern in HEADER_PATTERNS)


def subject_is_recognized(subject):
    text = clean(subject)
    if not text:
        return False
    lowered = text.lower()

    if is_bad_header(lowered):
        return False
    if starts_with_any(lowered, DEFAULT_CHAT_SUBJECTS):
        return True
    if starts_with_any(lowered, DEFAULT_VOICE_SUBJECTS):
        return True
    if contains_any(lowered, DEFAULT_EMAIL_SUBJECTS):
        return True
    if looks_like_generated_header(lowered):
        return True
    if MODULE_DESCRIPTION_PATTERN.match(text):
        return True
    return False


# ---------------------------------------------------------------------------
# Scoring context helpers
# ---------------------------------------------------------------------------
def new_context():
    return {"score": 0, "reasons": [], "lacks": [], "tags": [], "checks": [], "breakdown": []}


def add_score(ctx, amount, reason, tag=None):
    ctx["score"] += amount
    ctx["reasons"].append(reason)
    ctx["breakdown"].append((amount, reason))
    if tag:
        ctx["tags"].append(tag)


def add_check(ctx, label, active):
    ctx["checks"].append(status_tag(label, active))


def sort_requirement_checks(checks):
    """Feature 7 - always display Requirement Checks in the fixed order."""

    def order_key(pair):
        index, check = pair
        try:
            return (CHECK_ORDER.index(check["label"]), index)
        except ValueError:
            return (len(CHECK_ORDER), index)

    ordered = sorted(enumerate(checks), key=order_key)
    return [check for _, check in ordered]


# ---------------------------------------------------------------------------
# Feature 15 - rule functions (score_ticket is only the coordinator)
# ---------------------------------------------------------------------------
def apply_jira_rules(row, ctx, parsed_tags):
    """Feature 1 - Support Request Type Intelligence."""
    support_request_type = clean(pick(row, "Support Request Type", "Support request type"))
    jira_required = support_request_type.lower() in JIRA_REQUIRED_TYPES
    jira_present = has_jira_tag(parsed_tags)
    missing_jira = jira_required and not jira_present

    add_check(ctx, "Jira Required", missing_jira)
    if missing_jira:
        add_score(
            ctx,
            JIRA_REQUIRED_SCORE,
            "Support Request Type requires Jira but no Jira tag was found",
            "Jira Missing",
        )


def apply_status_rules(row, ctx, merged_ticket, hold_reason):
    """Feature 3 - Ticket Status Intelligence."""
    ticket_status = clean(pick(row, "Ticket Status", "Status"))
    needs_hold_reason = (not merged_ticket) and ticket_status.lower() in STATUS_REQUIRES_HOLD_REASON
    hold_blank = False if merged_ticket else is_blank(hold_reason)
    missing_hold = needs_hold_reason and hold_blank

    add_check(ctx, "Status requires Hold Reason", missing_hold)
    if missing_hold:
        add_score(
            ctx,
            STATUS_SCORE,
            f"{ticket_status} ticket has no Hold Reason",
            "Status Hold Missing",
        )


def apply_chat_rules(row, ctx, channel):
    if channel != "Chat":
        return
    duration = clean(pick(row, "Chat duration brackets"))
    has_long_chat = any(marker in duration for marker in CHAT_LONG_MARKERS)
    add_check(ctx, "Long Chat", has_long_chat)
    if has_long_chat:
        add_score(ctx, LONG_CHAT_SCORE, f"Chat duration is >{IDEAL_CHAT_MINUTES} min", "Long Chat")
    else:
        ctx["lacks"].append(f"chat is not >{IDEAL_CHAT_MINUTES} min")


def apply_voice_rules(row, ctx, channel):
    if channel != "Voice":
        return
    duration = parse_float(pick(row, "Call duration (min)"))
    has_ideal_call = duration is not None and duration > IDEAL_CALL_MINUTES
    has_ok_call = duration is not None and duration >= BACKUP_CALL_MINUTES

    add_check(ctx, "Long Call", has_ideal_call)
    add_check(ctx, "Call >=10 min", has_ok_call)

    if has_ideal_call:
        add_score(ctx, LONG_CALL_SCORE, f"Call duration is more than {IDEAL_CALL_MINUTES} min", "Long Call")
    elif has_ok_call:
        add_score(ctx, BACKUP_CALL_SCORE, f"Call duration is at least {BACKUP_CALL_MINUTES} min", "Usable Call")
        ctx["lacks"].append(f"call is not >{IDEAL_CALL_MINUTES} min")
    else:
        ctx["lacks"].append(f"call is below {BACKUP_CALL_MINUTES} min or duration is blank")


def apply_duration_rules(row, ctx, channel, subject):
    """Feature 5 (Suspicious Call Detection) + Feature 6 (Talk Time Validation)."""
    if channel != "Voice":
        return

    call_duration = parse_float(pick(row, "Call duration (min)"))
    subject_lower = subject.lower()

    matched_keyword = next((kw for kw in SUSPICIOUS_CALL_TYPES if kw in subject_lower), None)
    is_suspicious = (
        matched_keyword is not None
        and call_duration is not None
        and call_duration >= SUSPICIOUS_CALL_MINUTES
    )
    add_check(ctx, "Suspicious Call", is_suspicious)
    if is_suspicious:
        add_score(
            ctx,
            SUSPICIOUS_CALL_SCORE,
            f"Subject flags a '{matched_keyword}' but call lasted {call_duration} min, likely misclassified",
            "Suspicious Call",
        )

    talk_time = parse_float(
        pick(row, "Talk time (min)", "Talk Time", "Agent talk time (min)", "Talk duration (min)")
    )
    mismatch = (
        call_duration is not None
        and talk_time is not None
        and abs(call_duration - talk_time) >= DURATION_MISMATCH_THRESHOLD
    )
    add_check(ctx, "Duration Mismatch", mismatch)
    if mismatch:
        add_score(
            ctx,
            DURATION_MISMATCH_SCORE,
            f"Call duration ({call_duration} min) and talk time ({talk_time} min) differ significantly",
            "Duration Mismatch",
        )


def apply_subject_rules(ctx, subject):
    """Feature 4 - Subject Intelligence."""
    recognized = subject_is_recognized(subject)
    header_issue = not recognized
    add_check(ctx, "Header Issue", header_issue)
    if header_issue:
        add_score(
            ctx,
            HEADER_SCORE,
            "Subject does not match an expected pattern (chat/voice/email/filename/Module - Description)",
            "Header Issue",
        )
    else:
        ctx["lacks"].append("subject follows an expected header pattern")


def apply_module_feature_rules(row, ctx):
    module = pick(row, "Module")
    feature = pick(row, "Feature")
    module_blank = is_blank(module)
    feature_blank = is_blank(feature)

    add_check(ctx, "Blank Module", module_blank)
    add_check(ctx, "Blank Feature", feature_blank)

    if module_blank:
        add_score(ctx, BLANK_MODULE_SCORE, "Module/category is blank", "Blank Module")
    else:
        ctx["lacks"].append("module is already filled")

    if feature_blank:
        add_score(ctx, BLANK_FEATURE_SCORE, "Feature/category is blank", "Blank Feature")
    else:
        ctx["lacks"].append("feature is already filled")


def apply_organization_rules(row, ctx):
    org = pick(row, "Ticket organization", "Ticket organization name")
    org_blank = is_blank(org)
    add_check(ctx, "Blank Organization", org_blank)
    if org_blank:
        add_score(ctx, BLANK_ORGANIZATION_SCORE, "Organization is blank", "Missing Org")
    else:
        ctx["lacks"].append("organization is present")


def apply_csat_rules(row, ctx):
    rating = pick(row, "Ticket satisfaction rating", "Chat satisfaction rating")
    unsatisfied = is_unsatisfied(rating)
    add_check(ctx, "Low CSAT", unsatisfied)
    if unsatisfied:
        add_score(ctx, LOW_CSAT_SCORE, "Unsatisfied/low satisfaction signal", "Low CSAT")
    else:
        ctx["lacks"].append("no unsatisfied rating signal")


def apply_hold_rules(row, ctx, merged_ticket, hold_reason, solved_hour):
    """Solved Hour validation + Hold Reason validation.

    Feature 2: closed_by_merge tickets skip these validations entirely.
    """
    solved_blank = False if merged_ticket else is_blank(solved_hour)
    hold_blank = False if merged_ticket else is_blank(hold_reason)
    hold_tags = get_hold_reason_tags(hold_reason)

    add_check(ctx, "Solved hour blank", solved_blank)
    add_check(ctx, "Hold reason missing", solved_blank and hold_blank)
    for tag in hold_tags:
        add_check(ctx, tag, True)
        ctx["tags"].append(tag)

    if solved_blank:
        if hold_blank:
            add_score(
                ctx,
                MISSING_HOLD_REASON_SCORE,
                "Solved hour is blank and no hold reason is present",
                "Missing Hold Reason",
            )
        else:
            add_score(ctx, SOLVED_HOUR_BLANK_WITH_HOLD_SCORE, "Solved hour is blank; hold reason is present")
            ctx["lacks"].append("hold reason is present")
    else:
        ctx["lacks"].append("solved hour is present")


def apply_channel_priority(channel, ctx):
    if channel in PRIORITY_CHANNELS:
        add_score(ctx, CHANNEL_PRIORITY_SCORE, f"{channel} has channel priority", "Channel Priority")


def print_debug_breakdown(ticket_id, ctx):
    label = ticket_id or "(unknown)"
    print(f"Ticket {label}")
    for amount, reason in ctx["breakdown"]:
        print(f"  +{amount} {reason}")
    print(f"  Total = {ctx['score']}")


def build_priority_explanation(tags):
    """Feature 11 - concise, deduplicated explanation of why a ticket was prioritized."""
    seen = []
    for tag in tags:
        label = PRIORITY_EXPLANATION_LABELS.get(tag, tag)
        if label and label not in seen:
            seen.append(label)
    if not seen:
        return "Priority because: available ticket for target agent."
    bullets = "\n".join(f"\u2022 {item}" for item in seen)
    return f"Priority because:\n{bullets}"


def score_ticket(row, channel, ticket_id=None):
    """Coordinator - delegates to the apply_* rule functions above."""
    ctx = new_context()

    tags_raw = clean(pick(row, "Tags", "Tag", "Ticket tags"))
    parsed_tags = parse_tags(tags_raw)
    merged_ticket = has_merge_tag(parsed_tags)

    hold_reason = pick(row, "Keep on hold")
    solved_hour = pick(row, "Ticket solved - Hour")
    subject = clean(pick(row, "Ticket subject"))

    apply_jira_rules(row, ctx, parsed_tags)
    apply_status_rules(row, ctx, merged_ticket, hold_reason)
    apply_chat_rules(row, ctx, channel)
    apply_voice_rules(row, ctx, channel)
    apply_duration_rules(row, ctx, channel, subject)
    apply_subject_rules(ctx, subject)
    apply_module_feature_rules(row, ctx)
    apply_organization_rules(row, ctx)
    apply_csat_rules(row, ctx)
    apply_hold_rules(row, ctx, merged_ticket, hold_reason, solved_hour)
    apply_channel_priority(channel, ctx)

    if not ctx["reasons"]:
        ctx["reasons"].append("Available ticket for target agent")

    ctx["checks"] = sort_requirement_checks(ctx["checks"])

    if DEBUG_SCORING:
        print_debug_breakdown(ticket_id, ctx)

    return ctx["score"], ctx["reasons"], ctx["lacks"][:4], ctx["tags"], ctx["checks"], merged_ticket


def classify_rank(index, score):
    if index == 0:
        return "Ideal pick"
    if score >= 60:
        return "Strong backup"
    return "Backup option"


def build_brief(reasons, lacks):
    picked = "; ".join(reasons)
    missing = "; ".join(lacks) if lacks else "no major gaps against the sampling rules"
    return f"Picked because: {picked}. Lacks: {missing}."


def update_metric(metrics, name, amount=1):
    metrics[name] = metrics.get(name, 0) + amount


def update_metrics_from_ticket(metrics, checks_map, tags, merged_ticket):
    """Single source of truth for metrics - derived from the rule engine's own
    output instead of re-deriving blank/duration checks a second time."""
    if checks_map.get("Blank Module"):
        update_metric(metrics, "blankModule")
    if checks_map.get("Blank Feature"):
        update_metric(metrics, "blankFeature")
    if checks_map.get("Blank Organization"):
        update_metric(metrics, "blankOrganization")
    if checks_map.get("Low CSAT"):
        update_metric(metrics, "unsatisfied")
    if checks_map.get("Solved hour blank"):
        update_metric(metrics, "missingSolvedHour")
        if checks_map.get("Hold reason missing"):
            update_metric(metrics, "missingHoldReasonWhenUnsolved")
    if checks_map.get("Long Chat"):
        update_metric(metrics, "longChats")
    if checks_map.get("Long Call"):
        update_metric(metrics, "callsOver15")
    if checks_map.get("Call >=10 min"):
        update_metric(metrics, "callsOver10")

    # Feature 13 - additional metrics
    if "Jira Missing" in tags:
        update_metric(metrics, "jiraMissing")
    if "Header Issue" in tags:
        update_metric(metrics, "headerIssues")
    if "Suspicious Call" in tags:
        update_metric(metrics, "suspiciousCalls")
    if "Duration Mismatch" in tags:
        update_metric(metrics, "durationMismatch")
    if "Status Hold Missing" in tags:
        update_metric(metrics, "statusViolations")
    if merged_ticket:
        update_metric(metrics, "mergeTickets")


def tie_break_key(ticket):
    """Feature 12 - deterministic ordering when scores are tied."""
    tags = set(ticket["tags"])

    def has(tag_name):
        return 0 if tag_name in tags else 1

    return (
        -ticket["score"],
        has("Jira Missing"),
        has("Low CSAT"),
        has("Blank Module"),
        has("Blank Feature"),
        has("Missing Org"),
        has("Header Issue"),
        has("Long Chat"),
        has("Long Call"),
        -sort_date_ordinal(ticket["date"]),
        ticket["channel"] not in PRIORITY_CHANNELS,
        ticket["ticketId"],
    )


def merge_ticket_row(existing, row):
    """Merge a duplicate Ticket ID row into the first-seen row for that ticket.

    - Tags/Tag are combined into a deduplicated, sorted set.
    - All other fields keep the first non-blank value already in `existing`;
      blanks in `existing` get backfilled from `row`.
    """
    tags_key = next((k for k in existing if k.lower() in ("tags", "tag", "ticket tags")), None)
    if tags_key is None:
        tags_key = next((k for k in row if k.lower() in ("tags", "tag", "ticket tags")), None)

    if tags_key:
        existing_tags = set(parse_tags(existing.get(tags_key, "")))
        new_tags = set(parse_tags(row.get(tags_key, "")))
        existing[tags_key] = ", ".join(sorted(existing_tags | new_tags))

    for key, value in row.items():
        if key == tags_key:
            continue
        if is_blank(existing.get(key)) and not is_blank(value):
            existing[key] = value


def analyze_workbook(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    grouped = {agent: [] for agent in TARGET_AGENTS}
    sheet_summaries = {}
    sheet_order = []
    metrics = {
        "totalRows": 0,
        "targetRows": 0,
        "blankModule": 0,
        "blankFeature": 0,
        "blankOrganization": 0,
        "unsatisfied": 0,
        "missingSolvedHour": 0,
        "missingHoldReasonWhenUnsolved": 0,
        "longChats": 0,
        "callsOver15": 0,
        "callsOver10": 0,
        # Feature 13 - additional metrics
        "jiraMissing": 0,
        "headerIssues": 0,
        "suspiciousCalls": 0,
        "durationMismatch": 0,
        "statusViolations": 0,
        "mergeTickets": 0,
    }

    # Ticket IDs can appear on more than one row per sheet now that tags add
    # a row per tag (e.g. the same Ticket ID once per applied tag). Dedup/merge
    # happens per (channel, Ticket ID) so each real ticket is counted/scored
    # exactly once, no matter how many tag-duplicate rows it has.
    dedup_tickets = {}
    dedup_order = []

    for sheet in workbook.worksheets:
        rows = sheet.iter_rows(values_only=True)
        headers = [clean(value) for value in next(rows, [])]
        if not headers:
            continue

        channel = sheet_channel(sheet.title)
        sheet_summaries[sheet.title] = {
            "sheet": sheet.title,
            "channel": channel,
            "rows": 0,
            "targetAgentRows": 0,
        }
        sheet_order.append(sheet.title)

        for raw in rows:
            row = {headers[i]: raw[i] if i < len(raw) else "" for i in range(len(headers))}
            sheet_summaries[sheet.title]["rows"] += 1
            metrics["totalRows"] += 1

            ticket_id = normalize_ticket_id(pick(row, "Ticket ID"))
            if not ticket_id:
                continue

            dedup_key = (channel, ticket_id)

            if dedup_key not in dedup_tickets:
                dedup_tickets[dedup_key] = {
                    "row": row.copy(),
                    "channel": channel,
                    "sheet": sheet.title,
                    "ticketId": ticket_id,
                }
                dedup_order.append(dedup_key)
            else:
                merge_ticket_row(dedup_tickets[dedup_key]["row"], row)

    # Score each deduped ticket exactly once, using the channel/sheet it was
    # first seen under.
    for dedup_key in dedup_order:
        entry = dedup_tickets[dedup_key]
        row = entry["row"]
        channel = entry["channel"]
        owning_sheet = entry["sheet"]
        ticket_id = entry["ticketId"]

        agent_value = clean(pick(row, "Ticket assignee", "Assignee name"))
        lookup_name = AGENT_ALIAS.get(agent_value.lower(), agent_value)
        canonical_agent = AGENT_LOOKUP.get(lookup_name.lower())
        if not canonical_agent:
            continue

        metrics["targetRows"] += 1
        sheet_summaries[owning_sheet]["targetAgentRows"] += 1

        score, reasons, lacks, tags, checks, merged_ticket = score_ticket(row, channel, ticket_id=ticket_id)
        checks_map = {check["label"]: check["active"] for check in checks}
        update_metrics_from_ticket(metrics, checks_map, tags, merged_ticket)

        date = format_date(pick(row, "Ticket created - Date"))

        grouped[canonical_agent].append(
            {
                "score": score,
                "reasons": reasons,
                "lacks": lacks,
                "tags": tags,
                "checks": checks,
                "brief": build_brief(reasons, lacks),
                "priorityExplanation": build_priority_explanation(tags),
                "channel": channel,
                "sheet": owning_sheet,
                "date": date,
                "ticketId": ticket_id,
                "agent": canonical_agent,
                "assignee": agent_value,
                "organization": pick(row, "Ticket organization", "Ticket organization name"),
                "subject": pick(row, "Ticket subject"),
                "module": pick(row, "Module"),
                "feature": pick(row, "Feature"),
                "chatDuration": pick(row, "Chat duration brackets"),
                "callDuration": pick(row, "Call duration (min)"),
                "satisfaction": pick(row, "Ticket satisfaction rating", "Chat satisfaction rating"),
                "solvedHour": pick(row, "Ticket solved - Hour"),
                "keepOnHold": pick(row, "Keep on hold"),
            }
        )

    results = []
    for agent, tickets in grouped.items():
        tickets.sort(key=tie_break_key)
        picks = []
        for index, ticket in enumerate(tickets[:3]):
            picks.append({**ticket, "rank": index + 1, "recommendation": classify_rank(index, ticket["score"])})
        all_tickets = [
            {**ticket, "rank": index + 1, "recommendation": classify_rank(index, ticket["score"])}
            for index, ticket in enumerate(tickets)
        ]
        results.append(
            {
                "agent": agent,
                "available": len(tickets),
                "status": "Ready" if len(picks) >= 3 else "Shortage",
                "picks": picks,
                "tickets": all_tickets,
            }
        )

    return {
        "agents": results,
        "sheets": [sheet_summaries[title] for title in sheet_order],
        "metrics": metrics,
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/":
            target = ROOT / "index.html"
        else:
            target = (ROOT / route.lstrip("/")).resolve()
            if ROOT not in target.parents and target != ROOT:
                self.send_error(403)
                return

        if not target.exists() or target.is_dir():
            self.send_error(404)
            return

        content_type = "text/html"
        if target.suffix == ".css":
            content_type = "text/css"
        elif target.suffix == ".js":
            content_type = "application/javascript"

        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/api/analyze":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            self.send_json({"error": "Upload an .xlsx file first."}, 400)
            return

        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as handle:
            handle.write(self.rfile.read(length))
            temp_path = handle.name

        try:
            self.send_json(analyze_workbook(temp_path))
        except Exception as error:
            self.send_json({"error": str(error)}, 500)
        finally:
            Path(temp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Daily Ticket Sampler running at http://127.0.0.1:{PORT}")
    server.serve_forever()