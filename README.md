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

1. Pro vzhled otevri v Tampermonkey **existujici** skript
   (pri prvni instalaci vytvor novy), nahrad jeho cely obsah souborem
   [jira-workspace-issue.user.js](./jira-workspace-issue.user.js) a uloz Ctrl+S.
2. Pro aktualizaci stopek otevri **existujici** nainstalovany skript a nahrad ho
   obsahem [jira-workspace-timer.user.js](./jira-workspace-timer.user.js).
   Neinstaluj druhou kopii a nemaz data webu.
3. Povol Tampermonkey pristup k Jire a spousteni uzivatelskych skriptu.
   Obnov stranku Jiry.

## Automaticke aktualizace z GitHubu

Oba cele skripty uz obsahuji `@updateURL` a `@downloadURL` pro vetev `main`.
Po vyse uvedene jednorazove vymene obsahu uz hlavicku rucne neupravuj.

1. Repozitar musi byt verejny a nove soubory odeslane do vetve `main` na GitHubu.
   Lokalni commit sam nestaci. Verejnost repozitare meni vlastnik na GitHubu;
   zadny pristupovy token nepatri do skriptu ani URL.
2. V Tampermonkey otevri **Prehled / Dashboard -> Nastaveni / Settings**.
   V sekci **Aktualizace skriptu / Script Update** nastav interval, napr. denne.
   Pokud sekci nevidis, prepni rezim nastaveni na **Pokrocily / Advanced**.
   U obou skriptu ponech povolene kontroly aktualizaci.
3. Pro okamzitou kontrolu pouzij prikaz Tampermonkey pro kontrolu aktualizaci.
   Po instalaci nove verze obnov otevrenou Jiru.

Pri kazdem vydani zvys `@version` zmeneneho skriptu a publikuj soubor do `main`.
Tampermonkey kontroluje vyssi verzi v nastavenem intervalu, ne pri kazdem otevreni
Jiry; prohlizec s rozsirenim musi bezet. Nazvy voleb zavisi na verzi a jazyku.
Nemen `@name`, `@namespace` ani ulozena data. Neinstaluj duplicitni kopie.

Po zverejneni a publikovani lze prvni instalaci provest i pres prime odkazy:
[stopky](https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-timer.user.js)
a [vzhled](https://raw.githubusercontent.com/bunnydad02/jira-direct-timer/main/jira-workspace-issue.user.js).
U existujici instalace radeji nahrad obsah podle navodu vyse.

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
GitHub repozitar: [bunnydad02/jira-direct-timer](https://github.com/bunnydad02/jira-direct-timer).
Remote `origin` pouziva HTTPS; pristup vyzaduje opravneny GitHub ucet.
Nazev projektu a souboru je novy; fyzicka slozka
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
