// Praxisbesuche: Export aus dem Praktikumstool (Fächerliste) als JSON-Datei.
//
// Läuft im eigenen, angemeldeten Browser auf praktikumstool.phlu.ch – als Lesezeichen
// (siehe lesezeichen.txt). Liest nur Seiten, die man auch von Hand aufrufen kann:
// «Fächerliste» je Praktikumsart, Fach und Jahr, auf Wunsch die Detailseiten mit dem Stundenplan
// (nur die Mathe-Lektionen). Schreibt nichts ins Praktikumstool.
// Ergebnis: Wurde das Tool aus der Praxisbesuche-Seite geöffnet, gehen die Daten direkt dorthin zurück
// (postMessage); sonst praktika-<fach>-<jahre>.json im Download-Ordner.

(async () => {
  const FACH = { id: "11", kurz: "MA" };            // Mathematik
  const ARTEN = {                                     // id im Praktikumstool -> unsere Gruppe
    1: "Halbtag", 10: "Halbtag", 11: "Halbtag", 12: "Halbtag", 26: "Halbtag", 27: "Halbtag",
    2: "Profil", 5: "Profil", 15: "Profil", 16: "Profil", 17: "Profil", 7: "Profil",
    23: "Quartal", 24: "Quartal", 25: "Quartal",
    6: "Abschluss", 8: "Abschluss",
    9: "Spezial", 18: "Spezial", 22: "Spezial", 28: "Spezial",
  };
  if (location.host !== "praktikumstool.phlu.ch") {
    alert("Bitte zuerst im Praktikumstool anmelden und das Lesezeichen dort anklicken.");
    return;
  }
  // Auftrag von der Praxisbesuche-Seite holen (sie hat das Fenster geöffnet); sonst nachfragen
  const seite = await seiteFinden();
  // Auf der Seite einer einzelnen Person geklickt: nur dieses Praktikum (mit Stundenplan) nachtragen
  const hier = new URLSearchParams(location.search);
  const einzeln = hier.get("tab") === "praktikum" && hier.get("idpraktikum") ? hier.get("idpraktikum") : null;
  let jahre, mitPlan;
  if (einzeln) { jahre = [hier.get("jahr") || "26-27"]; mitPlan = true; }
  else if (seite) { jahre = jahreAus(seite.auftrag.jahre); mitPlan = !!seite.auftrag.plan; }
  else {
    const jetzt = (document.querySelector("select[name=jahr] option[value]:not([value=''])") || {}).value || "26-27";
    const antwort = prompt("Welche Studienjahre? (z.B. 26-27 oder 22-23 bis 26-27)", jetzt);
    if (!antwort) return;
    jahre = jahreAus(antwort);
    mitPlan = confirm(`Auch die Stundenpläne (Mathe-Lektionen: Zeit, Einzel/Doppel, danach frei) für ${jahre[jahre.length - 1]} mitnehmen?\n` +
      "Dauert etwa eine Minute (eine Seite je Praktikum).");
  }
  const hinweis = document.createElement("div");
  hinweis.style.cssText = "position:fixed;top:10px;right:10px;z-index:99999;background:#3a3a3a;color:#fff;" +
    "padding:10px 14px;font:14px Arial;border-radius:6px";
  document.body.appendChild(hinweis);

  const praktika = [];
  const artNamen = {};
  const andereArten = {};
  let n = 0;
  const gesamt = jahre.length * Object.keys(ARTEN).length;
  for (const jahr of jahre) {
    for (const [art, gruppe] of Object.entries(ARTEN)) {
      hinweis.textContent = `Lese ${++n} / ${gesamt} …`;
      const url = `/app/index.php?tab=faecherliste&prakt_art=${art}&fach=${FACH.id}&jahr=${jahr}`;
      const html = await (await fetch(url, { credentials: "include" })).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const opt = doc.querySelector(`select[name=prakt_art] option[value="${art}"]`);
      if (opt) artNamen[art] = opt.textContent.replace(/\s*\(\d+\)\s*$/, "").trim();
      // alle Arten, die das Tool für Mathe in diesem Jahr kennt: welche mit Praktika fehlen in ARTEN?
      for (const o of doc.querySelectorAll("select[name=prakt_art] option[value]")) {
        const m = o.textContent.match(/\((\d+)\)\s*$/);
        if (/^[1-9]\d*$/.test(o.value) && !ARTEN[o.value] && (!m || Number(m[1]) > 0)) andereArten[o.value] = o.textContent.trim() + " · " + jahr;
      }
      const tab = [...doc.querySelectorAll("table")].find(
        (t) => t.rows[0] && t.rows[0].cells[0] && t.rows[0].cells[0].innerText.includes("StudentIn"));
      if (!tab) continue;
      const kopf = [...tab.rows[0].cells].map((c) => c.innerText.trim().replace(/\s+/g, " "));
      for (const zeile of [...tab.rows].slice(1)) {
        const z = [...zeile.cells];
        if (z.length < kopf.length) continue;
        const a = z[0].querySelector("a");
        const link = a ? a.getAttribute("href") : "";
        const p = new URLSearchParams(link.split("?")[1] || "");
        const wert = (name) => { const i = kopf.indexOf(name); return i < 0 ? "" : z[i].innerText.trim().replace(/\s+/g, " "); };
        praktika.push({
          idstudent: p.get("idstudent"), idpraktikum: p.get("idpraktikum"),
          name: a ? a.innerText.trim() : "", studiengang: z[0].innerText.replace(a ? a.innerText : "", "").trim(),
          gruppe, art: Number(art), jahr,
          prid: wert("PrID"), schulort: wert("Schulort"), schulhaus: wert("Schulhaus"),
          von: wert("von"), bis: wert("bis"),
          faecher: wert("Fächer").split(",").map((s) => s.trim()).filter(Boolean),
          fachbesuche: Number(wert("Fach-besuche") || 0), mentoratsbesuche: Number(wert("+ Ment.Besuche") || 0),
          status: wert("Stat."), link,
        });
      }
      await new Promise((r) => setTimeout(r, 150));   // das Tool nicht hetzen
    }
  }
  if (einzeln) {
    const eins = praktika.filter((p) => p.idpraktikum === einzeln);
    if (!eins.length) { hinweis.textContent = "Dieses Praktikum hat kein Mathe – es gibt nichts nachzutragen."; setTimeout(() => hinweis.remove(), 8000); return; }
    praktika.length = 0; praktika.push(...eins);
  }
  // Spezialpraktika: auf der Seite der Person steht, wofür es ist, z.B. «Spezialpraktikum 1 (Halbtagespraktikum)»
  const spezial = praktika.filter((p) => (p.gruppe === "Spezial" || p.gruppe === "Abschluss") && p.link);
  for (let i = 0; i < spezial.length; i++) {
    hinweis.textContent = `Spezialpraktika ${i + 1} / ${spezial.length} …`;
    const doc = new DOMParser().parseFromString(await (await fetch(spezial[i].link, { credentials: "include" })).text(), "text/html");
    const h3 = [...doc.querySelectorAll("h3")].map((h) => h.textContent.replace(/\s+/g, " ").trim()).find((t) => /praktikum/i.test(t)) || "";
    const m = h3.match(/\((.*)\)\s*$/);
    spezial[i].zusatz = m ? m[1].trim() : h3;
    await new Promise((r) => setTimeout(r, 150));
  }
  if (mitPlan) {
    const planJahr = jahre[jahre.length - 1];
    const liste = praktika.filter((p) => p.jahr === planJahr && p.link);
    for (let i = 0; i < liste.length; i++) {
      hinweis.textContent = `Stundenpläne ${i + 1} / ${liste.length} …`;
      const html = await (await fetch(liste[i].link, { credentials: "include" })).text();
      const seite = new DOMParser().parseFromString(html, "text/html");
      liste[i].lektionen = matheLektionen(seite);
      liste[i].besuche = angemeldeteBesuche(seite);
      liste[i].kontakte = kontakte(seite, liste[i].lektionen);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  const daten = { quelle: "praktikumstool.phlu.ch, Fächerliste", fach: FACH.kurz, jahre, einzeln: !!einzeln,
                  erstellt: new Date().toISOString(), arten: artNamen, andereArten, praktika };
  if (seite) {
    hinweis.textContent = "Übergebe an die Praxisbesuche-Seite …";
    const ok = await new Promise((fertig) => {
      const t = setTimeout(() => fertig(false), 8000);
      window.addEventListener("message", function quittung(e) {
        if (e.data && e.data.typ === "praxisbesuche-erhalten") { clearTimeout(t); window.removeEventListener("message", quittung); fertig(e.data); }
      });
      seite.fenster.postMessage({ typ: "praxisbesuche-daten", daten }, "*");
    });
    if (ok) {
      hinweis.textContent = `Fertig: ${praktika.length} Praktika an die Praxisbesuche-Seite übergeben. Dieses Fenster kann zu.`;
      return;
    }
    hinweis.textContent = "Die Seite hat nicht geantwortet – speichere als Datei.";
  }
  const blob = new Blob([JSON.stringify(daten, null, 1)], { type: "application/json" });
  const dl = document.createElement("a");
  dl.href = URL.createObjectURL(blob);
  dl.download = `praktika-${FACH.kurz}-${jahre[0]}${jahre.length > 1 ? "_bis_" + jahre[jahre.length - 1] : ""}.json`;
  // Falls der Browser den automatischen Download blockiert: Knopf zum Speichern bleibt stehen
  dl.textContent = `Fertig – hier klicken: Datei speichern (${praktika.length} Praktika)`;
  dl.style.cssText = "position:fixed;top:60px;right:10px;z-index:99999;background:#7a5a2e;color:#fff;padding:12px 16px;font:bold 15px Arial;border-radius:6px;text-decoration:none";
  document.body.appendChild(dl);
  dl.click();
  hinweis.textContent = `Fertig: ${praktika.length} Praktika. Liegt die Datei nicht im Download-Ordner: braunen Knopf klicken.`;
  window.__pbFertig = { anzahl: praktika.length, kontakte: praktika.filter((p) => p.kontakte).length };

  // Stundenplan: je Woche eine Tabelle, Spalten = Tage, Zeilen = Lektionen.
  // Ergebnis: Mathe-Blöcke je Tag – von, bis, Anzahl Lektionen (Einzel/Doppel), ob danach frei ist.
  function matheLektionen(doc) {
    const minuten = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
    const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    const tage = {};   // datum -> alle Lektionen des Tages (jedes Fach)
    // Wochen sind der Reihe nach mit Sprungmarken w01, w02, … versehen (Überschrift über der Woche)
    [...doc.querySelectorAll("table.tabelleStundenplanWoche")].forEach((woche, wi) => {
      const wAnker = "w" + String(wi + 1).padStart(2, "0");
      const zeilen = [...woche.rows].filter((r) => r.parentElement.parentElement === woche);
      const daten = [...zeilen[0].querySelectorAll("td.datumInner")].map((td) => {
        const m = td.textContent.match(/(\d\d)\.(\d\d)\.(\d{4})/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
      });
      for (const z of zeilen) {
        const zellen = [...z.cells].filter((c) => c.parentElement === z);
        if (!zellen[0] || !zellen[0].classList.contains("zeit") || zellen.length < 3) continue;
        const [zeit, dauer] = zellen[1].textContent.trim().split(/\s+/);
        const von = minuten(zeit), bis = von + minuten(dauer || "00:45");
        zellen.slice(2).forEach((zelle, k) => {
          if (!daten[k]) return;
          for (const feld of zelle.querySelectorAll("div.lektionFeldDozEintrag")) {
            const fach = ((feld.querySelector("span[title]") || {}).textContent || "").trim();
            const anker = feld.querySelector("a[id^=lekt]");
            // Fach + Praxislehrperson <br> Klasse <br> …
            const teile = feld.innerHTML.split(/<br\s*\/?>/i).map((t) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
            // Lehrperson der Lektion: erste Zeile ohne den Fach-Text
            const fachDiv = feld.querySelector("div");
            const lehrer = teile[0].replace(fachDiv ? fachDiv.textContent.replace(/\s+/g, " ").trim() : "", "").trim();
            const gebucht = [...feld.querySelectorAll("tr.visitInfo")].map((t) => t.textContent.trim().replace(/\s+/g, " ")).filter(Boolean);
            (tage[daten[k]] ||= []).push({ von, bis, ma: /^MA:/.test(fach), id: anker ? anker.id.replace("lekt", "") : "",
                                           klasse: teile[1] || "", lehrer, woche: wAnker, gebucht });
          }
        });
      }
    });
    const bloecke = [];
    for (const [datum, l] of Object.entries(tage)) {
      l.sort((a, b) => a.von - b.von);
      for (let i = 0; i < l.length; i++) {
        if (!l[i].ma) continue;
        let j = i;   // direkt anschliessende Mathe-Lektion derselben Klasse = Doppellektion
        while (j + 1 < l.length && l[j + 1].ma && l[j + 1].von - l[j].bis <= 15 && l[j + 1].klasse === l[i].klasse) j++;
        const naechste = l.slice(j + 1).find((x) => x.von >= l[j].bis);
        const spaeter = l.slice(j + 1).filter((x) => x.von >= l[j].bis);
        bloecke.push({ datum, zeit: hhmm(l[i].von), bis: hhmm(l[j].bis), anzahl: j - i + 1, klasse: l[i].klasse,
                       id: l[i].id, ids: l.slice(i, j + 1).map((x) => x.id), lehrer: l[i].lehrer, woche: l[i].woche,
                       gebucht: l.slice(i, j + 1).flatMap((x) => x.gebucht),
                       frei: naechste ? naechste.von - l[j].bis : null,          // Minuten bis zur nächsten Lektion
                       naechste: naechste ? hhmm(naechste.von) : "",           // null = danach kein Unterricht mehr
                       rest: spaeter.length,                                    // Lektionen danach am selben Tag (alle Fächer)
                       schluss: spaeter.length ? hhmm(Math.max(...spaeter.map((x) => x.bis))) : "" });   // Ende des Unterrichts
        i = j;
      }
    }
    return bloecke.sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit));
  }

  // Die Praxisbesuche-Seite ist das Fenster, das dieses geöffnet hat; sie antwortet mit dem Auftrag.
  function seiteFinden() {
    return new Promise((fertig) => {
      const fenster = window.opener;
      if (!fenster || fenster.closed) { fertig(null); return; }
      const t = setTimeout(() => { window.removeEventListener("message", antwort); fertig(null); }, 1500);
      function antwort(e) {
        if (e.data && e.data.typ === "praxisbesuche-auftrag") {
          clearTimeout(t); window.removeEventListener("message", antwort);
          fertig({ fenster: e.source || fenster, auftrag: e.data });
        }
      }
      window.addEventListener("message", antwort);
      fenster.postMessage({ typ: "praxisbesuche-hallo" }, "*");
    });
  }

  // Tabelle «Angemeldete Besuche»: alle gebuchten Besuche (alle Fächer) mit Datum, Zeit, Fach, Dozent/in
  function angemeldeteBesuche(doc) {
    const t = [...doc.querySelectorAll("table")].find((t) => t.rows[0] && /Datum/.test(t.rows[0].textContent) && /Dozierende/.test(t.rows[0].textContent));
    if (!t) return [];
    return [...t.rows].slice(1).map((r) => [...r.cells].map((c) => c.textContent.trim().replace(/\s+/g, " "))).filter((z) => z.length >= 5)
      .map((z) => { const m = z[0].match(/(\d\d)\.(\d\d)\.(\d{4})/);
        return { datum: m ? `${m[3]}-${m[2]}-${m[1]}` : z[0], zeit: z[1], dauer: z[2], fach: z[3], dozent: z[4].split("/")[0].trim(), klasse: z[5] || "" }; });
  }

  // Kontakte von der Detailseite: Mentor/in und Praxislehrpersonen mit E-Mail und Telefon.
  // Die PxL, die die Mathe-Lektionen hält, wird markiert (mathe: true).
  function kontakte(doc, lektionen) {
    const k = { mentor: null, pxl: [], student: null };
    const sm = doc.querySelector('a[href^="mailto:"][href*="@stud.phlu.ch"]');
    if (sm) k.student = { mail: sm.getAttribute("href").replace(/^mailto:/, "").split("?")[0] };
    const st = [...doc.querySelectorAll("p strong")].find((s) => /Mentor/i.test(s.textContent));
    const ma = st && st.parentElement.querySelector("a[href^=mailto]");
    if (ma) k.mentor = { name: ma.textContent.trim(), mail: ma.getAttribute("href").replace(/^mailto:/, "").split("?")[0] };
    const schl = (n) => n.toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");   // Reihenfolge Vor-/Nachname egal
    const matheLehrer = new Set((lektionen || []).map((l) => schl(l.lehrer || "")).filter(Boolean));
    for (const td of doc.querySelectorAll("td.lableSchulhausPersonen")) {
      const rolle = td.textContent.replace(/\s+/g, " ").trim();
      if (!/PxL/i.test(rolle)) continue;
      const tr = td.parentElement, z = [...tr.cells];
      const name = ((tr.querySelector("td.nameSchulhausPersonen") || {}).textContent || "").replace(/\s+/g, " ").trim();
      const tel = z.length ? z[z.length - 1].textContent.replace(/\s+/g, " ").trim().replace(/^-$/, "") : "";
      const naechste = tr.nextElementSibling, a = naechste && naechste.querySelector("a[href^=mailto]");
      k.pxl.push({ rolle, name, mail: a ? a.getAttribute("href").replace(/^mailto:/, "").split("?")[0] : "", tel,
                   mathe: matheLehrer.has(schl(name)) });
    }
    return k;
  }

  function jahreAus(text) {
    const m = text.match(/(\d\d)-(\d\d)(?:\s*(?:bis|-|–)\s*(\d\d)-(\d\d))?/);
    if (!m) return [text.trim()];
    if (!m[3]) return [`${m[1]}-${m[2]}`];
    const liste = [];
    for (let j = Number(m[1]); j <= Number(m[3]); j++) {
      liste.push(`${String(j).padStart(2, "0")}-${String(j + 1).padStart(2, "0")}`);
    }
    return liste;
  }
})();
