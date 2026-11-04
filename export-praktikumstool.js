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
  let jahre, mitPlan;
  if (seite) { jahre = jahreAus(seite.auftrag.jahre); mitPlan = !!seite.auftrag.plan; }
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
  if (mitPlan) {
    const planJahr = jahre[jahre.length - 1];
    const liste = praktika.filter((p) => p.jahr === planJahr && p.link);
    for (let i = 0; i < liste.length; i++) {
      hinweis.textContent = `Stundenpläne ${i + 1} / ${liste.length} …`;
      const html = await (await fetch(liste[i].link, { credentials: "include" })).text();
      liste[i].lektionen = matheLektionen(new DOMParser().parseFromString(html, "text/html"));
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  const daten = { quelle: "praktikumstool.phlu.ch, Fächerliste", fach: FACH.kurz, jahre,
                  erstellt: new Date().toISOString(), arten: artNamen, praktika };
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
  document.body.appendChild(dl);
  dl.click();
  hinweis.textContent = `Fertig: ${praktika.length} Praktika gespeichert (${dl.download}).`;
  setTimeout(() => hinweis.remove(), 8000);

  // Stundenplan: je Woche eine Tabelle, Spalten = Tage, Zeilen = Lektionen.
  // Ergebnis: Mathe-Blöcke je Tag – von, bis, Anzahl Lektionen (Einzel/Doppel), ob danach frei ist.
  function matheLektionen(doc) {
    const minuten = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
    const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    const tage = {};   // datum -> alle Lektionen des Tages (jedes Fach)
    for (const woche of doc.querySelectorAll("table.tabelleStundenplanWoche")) {
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
            const gebucht = [...feld.querySelectorAll("tr.visitInfo")].map((t) => t.textContent.trim().replace(/\s+/g, " ")).filter(Boolean);
            (tage[daten[k]] ||= []).push({ von, bis, ma: /^MA:/.test(fach), id: anker ? anker.id.replace("lekt", "") : "",
                                           klasse: teile[1] || "", gebucht });
          }
        });
      }
    }
    const bloecke = [];
    for (const [datum, l] of Object.entries(tage)) {
      l.sort((a, b) => a.von - b.von);
      for (let i = 0; i < l.length; i++) {
        if (!l[i].ma) continue;
        let j = i;   // direkt anschliessende Mathe-Lektion derselben Klasse = Doppellektion
        while (j + 1 < l.length && l[j + 1].ma && l[j + 1].von - l[j].bis <= 15 && l[j + 1].klasse === l[i].klasse) j++;
        const naechste = l.slice(j + 1).find((x) => x.von >= l[j].bis);
        bloecke.push({ datum, zeit: hhmm(l[i].von), bis: hhmm(l[j].bis), anzahl: j - i + 1, klasse: l[i].klasse,
                       id: l[i].id, ids: l.slice(i, j + 1).map((x) => x.id),
                       gebucht: l.slice(i, j + 1).flatMap((x) => x.gebucht),
                       frei: naechste ? naechste.von - l[j].bis : null,          // Minuten bis zur nächsten Lektion
                       naechste: naechste ? hhmm(naechste.von) : "" });           // null = danach kein Unterricht mehr
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
