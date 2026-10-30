# Jira Local Workspace

Lokalni modernizace Jiry: kompaktni tmavy detail ukolu a spolehlive vykazovani casu.
Zadny serverovy plugin, build, API klic ani zmena pro ostatni uzivatele.
Cilem je modernejsi pracovni prostredi, ne nahrada funkcnosti Jiry.

## Dva nezavisle Tampermonkey skripty

| Skript | Ucel |
| --- | --- |
| [jira-workspace-issue.user.js](./jira-workspace-issue.user.js) | Kompaktni dark mode inspirovany Asanou: ploche sekce, husta metadata, tmave formulare i stopky, responzivni sloupce, navigace a prepnuti na puvodni vzhled. |
| [jira-workspace-timer.user.js](./jira-workspace-timer.user.js) | Samostatne stopky, soucet vykazaneho casu otevreneho ukolu a prime ukladani worklogu, vcetne obnoveni nejisteho zapisu. |

Oba jsou urcene pro `https://jira.alza.cz/*`. Lze je pouzivat spolu i oddelene.
Redesign neodesila zadne pozadavky, nemeni obsah ukolu a neovlada stopky.
Tlacitka editace, workflow, komentare, prilohy i pluginy zustavaji nativni.
Zmeny vzhledu se aktivuji jen na rozpoznanem detailu, vcetne `selectedIssue`.

## Instalace

1. V Tampermonkey vytvor **novy** skript pro
   [jira-workspace-issue.user.js](./jira-workspace-issue.user.js), vloz jeho cely
   obsah a uloz. Obnov detail ukolu.
2. Pro aktualizaci stopek otevri **existujici** nainstalovany skript a nahrad ho
   obsahem [jira-workspace-timer.user.js](./jira-workspace-timer.user.js).
   Neinstaluj druhou kopii a nemaz data webu.
3. Povol Tampermonkey pristup k Jire a spousteni uzivatelskych skriptu.
   Uprava souboru v Gitu sama nainstalovany skript neaktualizuje.

Nad detailem se objevi lista **Jira Local Workspace** s odkazy na dostupne sekce.
Kompaktni rezim je **zapnuty ve vychozim stavu**. **Kompaktni** prepina hustotu
rozestupu; na siroke obrazovce sklada podporovana metadata do dvou sloupcu.
Zadna velka uvodni karta, gradienty ani stiny mezi sekcemi.
**Puvodni vzhled** okamzite vypne redesign;
tlacitko **Novy vzhled** jej znovu zapne. Volby zustavaji v tomto profilu
prohlizece. Pro uplny navrat vypni novy skript v Tampermonkey a obnov stranku.
Stopky funguji dale; jejich dosavadni skryti Clockify tim neni ovlivneno.
Dark mode pouze prebarvi jejich panel a potvrzeni, bez zmeny mereni a ukladani.
Vypnutim redesignu se vrati take puvodni barvy stopek.

Podrobny navod, vcetne bezpecne obnovy worklogu:
[jira-workspace-help.txt](./jira-workspace-help.txt).

## Vyvoj a overeni

Zmena je oddelena ve vetvi `feat/jira-local-workspace`; `master` zustava beze zmen.
Projekt se drive jmenoval Jira direct timer. Interni identifikatory stopek jsou
umyslne zachovany kvuli rozpracovanemu casu, zamykani a ochrane proti duplicitam.
Neni nastaven zadny Git remote. Nazev projektu a souboru je novy; fyzicka slozka
otevreneho checkoutu zustava puvodni, aby se nerozbil editor. Po zavreni editoru
ji lze prejmenovat na `jira-local-workspace` a znovu otevrit. Nazev slozky neni
verzovanou soucasti vetve.

Bez instalace zavislosti, z korene projektu:

```powershell
node --check .\jira-workspace-issue.user.js
node --check .\jira-workspace-timer.user.js
node .\jira-workspace-issue.test.cjs
node .\jira-workspace-timer.test.cjs
```

[Browser fixture](./tests/jira-workspace-issue.fixture.html) obsahuje pouze
synteticky detail, zadna soukroma Jira data. Otevri ji v prohlizeci pro lokalni
kontrolu vzhledu a obou skriptu. Nepripojuje se k Jire a nevytvari worklogy.
Regrese neprokazuji funkcnost vsech variant ziveho Jira DOM; na skutecnem detailu
je potreba overit konkretni Jira/plugin rozlozeni. Neprovadej diagnosticke zapisy
do skutecnych worklogu bez souhlasu.

Kontext, datove invarianty a historie: [HANDOFF.md](./HANDOFF.md).
