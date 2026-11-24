#!/usr/bin/env python3
"""Writes the article into index.html (between its article markers) and rewrites/pairs.md from the article text (rewrites/source-paragraphs.json, as fetched from
Global Voices on 2026-11-23) and the plainer sentences below. Checks that every hard sentence is verbatim in its paragraph.
python3 scripts/build-article.py"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = json.loads((ROOT / "rewrites/source-paragraphs.json").read_text())

# Units: one or more consecutive source paragraphs the engine treats as one paragraph (a one-line paragraph joins its
# neighbour). `hard` = the unit's hardest sentence (never a quote: quotes and the youths' own questions stay their words).
# `reused` = hand-checked in the portfolio repo (case-study Try-it card and tile, approved 2026-11-11).
UNITS = [
 dict(src=[1], hard="They pick up worn-out notebooks, walk to overcrowded learning centers with very limited resources, or teach themselves because there is nowhere else for them to continue their education.",
      light="They pick up worn-out notebooks, walk to overcrowded learning centers with very limited resources, or teach themselves because they have nowhere else to continue their education."),
 dict(src=[2], hard="Rohingya refugees are not allowed to pursue formal education in Bangladesh because of government policies that restrict their access to the national education system.",
      light="Rohingya refugees are not allowed to pursue formal education in Bangladesh, because government policies restrict their access to the national education system."),
 dict(src=[3, 4, 5], hard="What they have lost is something very different — the opportunity to learn freely, continue their studies, and build the future they imagined before violence forced them to flee their homeland.",
      light="They have lost something very different. They have lost the opportunity to learn freely, continue their studies, and build the future they imagined before violence forced them to flee their homeland."),
 dict(heading=6, src=[7], hard="Every day Mohammed Furkan, a poet and youth activist, sees young people studying Burmese, English, mathematics, science, history, and geography late into the night, sharing books with friends, teaching younger children, and refusing to let education disappear from their lives.",
      light="Every day, Mohammed Furkan, a poet and youth activist, sees young people studying Burmese, English, mathematics, science, history, and geography late into the night. Every day, he also sees them sharing books with friends, teaching younger children, and refusing to let education disappear from their lives."),
 dict(src=[8, 9], hard="Furkan’s words capture a simple but powerful truth: No young person’s future should be determined by the place where they were forced to seek safety.",
      light="Furkan’s words capture a simple but powerful truth. No young person’s future should be decided by where they were forced to seek safety."),
 dict(src=[10], hard="Their education is interrupted not because they lack determination, but because educational opportunities in the refugee camps in Bangladesh are limited.",
      light="Their education is interrupted, but not because they lack determination. It is interrupted because educational opportunities in the refugee camps in Bangladesh are limited."),
 dict(src=[11], hard="Although some learning centers provide access to basic education and some students can study under the Myanmar Curriculum Pilot, many children still cannot access continuous, quality education.",
      light="Some learning centers provide access to basic education, and some students can study under the Myanmar Curriculum Pilot. Even so, many children still cannot access continuous, quality education."),
 dict(heading=12, src=[13], hard="One Rohingya youth, Aung Naing Soe, explained that education for Rohingya refugees is primarily funded by UNICEF and implemented through partners such as CODEC, BRAC, JCF, Coast Foundation, and other NGOs.",
      light="One Rohingya youth, Aung Naing Soe, explained that education for Rohingya refugees is mainly funded by UNICEF and provided through partners such as CODEC, BRAC, JCF, Coast Foundation, and other NGOs."),
 dict(src=[14], reused=True, hard="According to Ali Jinnah Hussin, a human rights activist and researcher, although around 6,400 informal learning centers operate in the refugee camps and are supported by INGOs, many Rohingya children prefer community-led schools because they believe that qualified teachers and the Myanmar curriculum better prepare them for the future.",
      light="According to Ali Jinnah Hussin, a human rights activist and researcher, around 6,400 informal learning centers operate in the refugee camps and are supported by INGOs. Even so, he says, many Rohingya children prefer community-led schools. They believe that qualified teachers and the Myanmar curriculum better prepare them for the future."),
 # The paragraph's longest sentence ("In contrast, ... making community-led schools a better choice") can't be split without
 # deciding whose judgment its last clause is (Sol, rounds 1-3), so its Light target is the next hardest.
 dict(src=[15], hard="These schools are run by experienced Rohingya teachers, many of whom taught in Myanmar before being displaced, and they continue to teach by following the Myanmar curriculum.",
      light="These schools are run by experienced Rohingya teachers. Many of them taught in Myanmar before being displaced. The teachers continue to teach by following the Myanmar curriculum."),
 dict(src=[16], hard="Without internationally recognized certificates or accredited qualifications, years of study and achievement carry little value beyond the camp boundaries, leaving many talented Rohingya students without opportunities to continue their education.",
      light="Without internationally recognized certificates or accredited qualifications, years of study and achievement carry little value beyond the camp boundaries. This leaves many talented Rohingya students without opportunities to continue their education."),
 dict(src=[17], hard="However, although they can complete secondary education in the Bangladesh refugee camps, Rohingya people can’t access higher education because no Bangladesh university can admit them due to their refugee status.",
      light="However, even though they can finish secondary education in the refugee camps in Bangladesh, Rohingya people can’t access higher education. The reason is that no university in Bangladesh can admit them because of their refugee status."),
 dict(src=[18, 19, 20], hard="Young people who once imagined wearing graduation gowns instead begin searching for daily work simply to help their families survive.",
      light="Young people who once imagined wearing graduation gowns start looking for daily work instead, just to help their families survive."),
 dict(src=[21], hard="According to UNHCR, only a small proportion of refugee youth worldwide are able to access higher education, despite having the ability, determination, and desire to continue learning.",
      light="According to UNHCR, only a small proportion of refugee youth worldwide are able to access higher education, even though they have the ability, determination, and desire to continue learning."),
 dict(heading=22, src=[23], hard="Ro Hefzu, a poet, explains what it felt like to have his learning abruptly cut off due to his refugee status.",
      light="Ro Hefzu, a poet, explains what it felt like to have his learning suddenly cut off because of his refugee status."),
 dict(src=[24, 25], hard="When that hope is interrupted, the emotional impact runs deep.",
      light="When that hope is interrupted, the emotional impact is deep."),
 dict(src=[26], hard="She lives in the world’s largest refugee camp settlement in Cox's Bazar, Bangladesh, with her disabled brother, whose severe mental illness makes him nearly unable to take care of himself.",
      light="She lives in the world’s largest refugee camp settlement in Cox's Bazar, Bangladesh, with her disabled brother. His severe mental illness means he can barely take care of himself."),
 dict(src=[27], hard="She wants to save the lives of other women, so that she doesn’t have to see others dying, like her mother, because they have no access to medical services.",
      light="She wants to save other women’s lives so she doesn’t have to see others dying, as her mother did, because they have no access to medical services."),
 dict(src=[28, 29, 30], hard="Others continue studying without knowing whether their efforts will ever open the doors they dream of.",
      light="Others keep studying, not knowing if their efforts will ever open the doors they dream of."),
 dict(src=[31], hard="Research by Save the Children shows that long-term interruptions to education can affect mental well-being, confidence, and future opportunities.",
      light="Research by Save the Children shows that long breaks in education can affect mental well-being, confidence, and future opportunities."),
 dict(heading=32, src=[33], hard="They want quality education, recognized certificates, vocational training, scholarships, access to universities, and a fair chance to build meaningful lives through knowledge and hard work.",
      light="They want quality education, recognized certificates, vocational training, scholarships, and access to universities. They want a fair chance to build meaningful lives through knowledge and hard work."),
 dict(src=[34, 35], hard="The voices of Rohingya youth in this article send one clear message: they have not given up on education, and the world should not give up on them.",
      light="The voices of Rohingya youth in this article send one clear message. They have not given up on education, and the world should not give up on them."),
]

words = lambda s: len(s.split())
used = set()
units = []
for i, u in enumerate(UNITS, 1):
    paras = [SRC[k][1] for k in u["src"]]
    assert all(SRC[k][0] == "p" for k in u["src"]), (i, u["src"])
    hits = [j for j, p in enumerate(paras) if u["hard"] in p]
    assert len(hits) == 1, f"unit {i}: hard sentence not found verbatim once"
    used.update(u["src"])
    h = None
    if "heading" in u:
        assert SRC[u["heading"]][0] == "h3"; h = SRC[u["heading"]][1]; used.add(u["heading"])
    grow = words(u["light"]) / words(u["hard"]) - 1
    units.append(dict(n=i, heading=h, paras=paras, at=hits[0], orig=u["hard"], light=u["light"], reused=bool(u.get("reused")), grow=round(grow, 3)))
    print(f"¶{i:>2} {'reused' if u.get('reused') else 'new   '} {words(u['hard']):>3} -> {words(u['light']):>3} words ({grow:+.0%})")

# Everything from the article body is used except the series note (index 0), which the footer replaces.
missing = [k for k in range(len(SRC)) if k not in used]
assert missing == [0], missing

esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
html = []
for u in units:
    if u["heading"]:
        html.append(f'<h2 class="sh">{esc(u["heading"])}</h2>')
    html.append(f'<div class="u" data-u="{u["n"]}"><span class="u-num" aria-hidden="true">¶{u["n"]}</span>')
    for j, p in enumerate(u["paras"]):
        if j == u["at"]:
            a, b = p.split(u["orig"], 1)
            p = f'{esc(a)}<span class="s" data-light="{esc(u["light"])}">{esc(u["orig"])}</span>{esc(b)}'
            html.append(f'<p class="has-s">{p}</p>')
        else:
            html.append(f"<p>{esc(p)}</p>")
    html.append("</div>")
index = ROOT / "index.html"
page = index.read_text()
a, b = "<!-- article:start -->", "<!-- article:end -->"
i, j = page.index(a) + len(a), page.index(b)
index.write_text(page[:i] + "\n" + "\n".join(html) + "\n" + page[j:])

md = ["# Plainer sentences: original vs Light", "",
      "Light rules: it may split a sentence. It may not reorder, drop or add an idea, and it keeps every term. Plain, natural English.",
      "Source: Global Voices, “The lost generation” (28 July 2026), CC BY 3.0. One pair per reading paragraph (¶ = the reader's paragraph).",
      "Meaning check: GPT Sol (gpt-6.2-sol, high), rewrites/sol/. Rounds 1-3 also judged wording and kept reversing its own suggestions;",
      "round 4 checked meaning and terms only (20 OK, 1 flag: ¶10), round 5 re-checked the fixed ¶10 (OK). All 21 new pairs pass.", ""]
for u in units:
    tag = "REUSED (hand-checked, case study)" if u["reused"] else "NEW"
    md += [f"## ¶{u['n']} · {tag}", "", f"**Original:** {u['orig']}", "", f"**Light:** {u['light']}", "",
           f"Words: {words(u['orig'])} → {words(u['light'])} ({u['grow']:+.0%})", ""]
(ROOT / "rewrites/pairs.md").write_text("\n".join(md))
new = [u for u in units if not u["reused"]]
sol = ["# Pairs for meaning check", "", "Each pair: an ORIGINAL sentence from a published article and a LIGHT (plainer) rewrite.", ""]
for u in new:
    sol += [f"## Pair ¶{u['n']}", "", f"ORIGINAL: {u['orig']}", "", f"LIGHT: {u['light']}", ""]
(ROOT / "rewrites/sol/pairs.md").write_text("\n".join(sol))
print(f"{len(units)} units, {len(new)} new, {len(units) - len(new)} reused")
