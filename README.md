# Jira Local Workspace - stopky

Projekt obsahuje pouze Tampermonkey stopky pro vykazovani casu do Jiry.
Bezi lokalne v prohlizeci, uklada worklogy primo do Jiry a nepotrebuje serverovy
plugin, API klic ani externi ucet. Stopky nejsou propojene s Clockify.

## Instalace

1. V Tampermonkey otevri existujici Jira stopky, nebo pri prvni instalaci
   vytvor novy skript.
2. Nahrad cely obsah skriptu souborem
   [jira-workspace-timer.user.js](./jira-workspace-timer.user.js) a uloz jej.
3. Povol Tampermonkey pristup k `https://jira.alza.cz/*` a obnov Jiru.
4. Pri aktualizaci nepouzivej druhou kopii a nemaz data webu; rozpracovane
   mereni zustane zachovane.

Aktualizacni metadata odkazuji na soubor ve verejne vetvi `main` na GitHubu.
Tampermonkey nabidne aktualizaci, az publikovana verze prevysi nainstalovanou.
Pri kazdem vydani zmen `@version` i konstantu `VERSION` v userscriptu.
Nastaveni aktualizaci najdes v Tampermonkey v Dashboard -> Settings ->
Script Update. Pristupovy token nevkladej do skriptu ani URL.

## Vydani a prehled zmen

Kazda uzivatelska verze ma vlastni
[GitHub Release](https://github.com/bunnydad02/jira-direct-timer/releases)
s citelnym prehledem zmen, ne pouze Git tag.

Pri vydani zvys `@version` i `VERSION` a ve stejnem PR pridej
`releases/v<verze>.md` podle [v1.16.7](./releases/v1.16.7.md).
Poznamky popisuji skutecne zmeny pro uzivatele, aktualizaci a provedene overeni.
CI vyzaduje soubor pro aktualni verzi, odpovidajici nadpis a sekci `Changes`.
Od verze 1.17.4 musi poznamky obsahovat i sekci `## Screenshots` s relevantnimi
obrazky ve tvaru `![popis](../docs/screenshots/<stav>.png)`. Pri publikaci se
odkazy pripnou na tag verze, takze kazdy Release trvale ukazuje svou podobu.
Po mergi do `main` a uspesnych regresich automaticky publikuje tag a Release
s timto textem. Zmeny pouze dokumentace nebo testu novou verzi nevyzaduji
a jiz publikovany Release neprepisuji.

Pri chybe publikace oprav pricinu a znovu spust workflow `Validate userscripts`
nad `main` v GitHub Actions. Opakovany beh nevytvari duplicity a neposouva
existujici tagy. Vydani je hotove az po overeni publikovaneho Release.
Tampermonkey nadale aktualizuje z `main`; GitHub Release slouzi jako
prehled vydanych verzi a jejich zmen.

## Pouziti

- `START` spusti mereni na otevrenem ukolu. Pokud uz bezi jiny casovac,
  nejprve ulozi jeho worklog a nove mereni navaze bez mezery kvuli API.
- Samotna navigace na jiny ukol mereni neprepina.
- `STOP` zastavi a ulozi prave mereny ukol.
- `CANCEL` zahodi pouze dosud neulozene mereni.
- `ADD MINUTES` zapise kladny pocet celych minut na otevrenem ukolu.
  Potvrdit lze tlacitkem nebo klavesou Enter. Rucni zapis nemeni bezici casovac.
- Otevreny ukol se na strance `/browse/<KLIC>` bere vzdy z adresy; parametr
  `selectedIssue` plati jen na boardu / backlogu.
- Tlacitko `auto` u `ADD MINUTES` otevre nastaveni automatickeho vykazovani.
  Po zapnuti se pri vytvoreni issue pres Jira stranku automaticky vykaze
  nastaveny pocet minut (vychozi hodnota 10), vcetne Sub-task Bugu pres Jira
  formular i REST API. Vyzaduje platny klic v odpovedi na vytvoreni. Vypnuto je
  vychozi stav; automatika nemeni bezici stopky. Vytvoreni mimo tuto stranku
  nezachyti. Stav je videt primo v panelu: zapnute AUTO je zelene tucne se
  zelenou teckou (minuty ukaze tooltip), vypnute sede s prazdnym krouzkem a
  poskozene nastaveni cervene jako `auto !`.
- Stitek `oblibene N` vedle nadpisu otevre seznam oblibenych tasku (max 10).
  U kazdeho je `+min` (zapis minut primo do nej), `▶` (spusti stopky stejne
  jako START, i kdyz task neni otevreny, a seznam se zavre), `■` u
  bezici polozky a kos pro odebrani. `+` otevre hledani: klik na nazev
  otevre task v nove karte, jen `+` u vysledku ho ulozi. Pri plnem seznamu
  je hledani zablokovane s vysvetlenim.
- Panel zobrazuje pouze tvuj dosud vykazany cas otevreneho ukolu podle
  prihlaseneho Jira uctu, nikoli vykazy kolegu. Pokud mas vlastni vykazy i na
  subtaskech, nasleduje v zavorce tvuj soucet vcetne subtasku (napr.
  `Dosud vykazano: 2h (3,5h)`). Shodne soucty se neopakuji. Oba casy jsou
  zaokrouhlene na desetiny hodiny; zavorka se porovnava podle presnych sekund.
  Chyba nacteni identity, autora nebo worklogu se zobrazi v panelu misto
  nepresneho souctu. Casy se ctou ze vsech stran worklogu ukolu i subtasku.
- Cela stara sekce Clockify je skryta. Stopky ji neodinstaluji ani neovladaji;
  pred pouzitim zastav jine bezici stopky, abys cas nevykazal dvakrat.

## Obnova a bezpecnost dat

Stav se uklada do `localStorage` Jira webu a sdili se mezi kartami stejneho
profilu. Nemaz data webu ani nemen prihlaseneho uzivatele, dokud mereni nebo
ukladani neni dokonceno.

Worklog se uklada primo do Jiry a zachovava odhad zbyvajici prace. Minimum
zaznamu je jedna minuta; delsi intervaly se zaokrouhluji dolu na cele minuty.
Pri nejasnem vysledku POST se zapis automaticky neopakuje, aby nevznikla
duplicita. Pouzij `Ulozit / Overit`; pokud Jira zaznam nenajde, zkontroluj
Work log rucne a stejny cas znovu neposilej bez kontroly.

Podrobny navod a invarianty pro udrzbu jsou v
[jira-workspace-help.txt](./jira-workspace-help.txt) a [HANDOFF.md](./HANDOFF.md).

## Vyvoj a testy

Bez instalace zavislosti, z korene projektu:

```powershell
node --check .\jira-workspace-timer.user.js
node .\jira-workspace-timer.test.cjs
```

Testy pouzivaji Node.js a simulovane Jira odpovedi; neodesilaji pozadavky na
Jiru ani nevytvareji skutecne worklogy.

### Interaktivni lokalni hriste

Pro testovaci nastroje pouzij Node.js 20 nebo novejsi. Samotne Tampermonkey
stopky nadale nepotrebuji zadne zavislosti ani server.

```powershell
npm run playground
```

Otevri `http://127.0.0.1:4173`. Instalace zavislosti pro samotne hriste neni
potreba. Vlevo dole bezi skutecny produkcni panel, nikoli jeho napodobenina.
Prepinej mezi `DEMO-101` az `DEMO-103`, posunuj cas a zkousej START, STOP,
CANCEL a ADD MINUTES (i Enter). Vedle panelu vidis simulovane worklogy,
stav a API pozadavky. Lze simulovat reload i chybu pred ulozenim nebo ztracenou
odpoved po ulozeni. Tlacitko **Spustit vsechny regresni scenare** zobrazi
vysledek kazdeho scenare a postupne meni skutecny panel.

Vse zustava pouze v pameti stranky, nepouziva se skutecny `localStorage`.
Simulovany reload pamet zachova; skutecny refresh nebo reset ji zahodi.
Server posloucha jen na loopbacku a odmita zapisy, CSP blokuje sitova spojeni.
Odkazy panelu se zachyti lokalne. Neni potreba Jira ucet ani Tampermonkey.
Server ukoncis pomoci Ctrl+C.

### Automaticke browserove regrese

```powershell
npm ci
npx playwright install chromium
npm test
```

`npm test` spousti puvodni Node regrese, kontroly vydani, bezpecnostni audit
(`npm run audit:security`) i nove Chromium scenare.
Pouze browserove testy spustis pres `npm run test:browser`; server si spusti
samy (port 4173 musi byt volny). Scenare jsou sdilene s interaktivnim hristem:
barvy a rozmery panelu, texty a odkazy, instalovana verze podle metadat,
hodiny, prepinani tasku, ukladani/minimum/zaokrouhleni, cancel, rucni minuty,
toasty, reload, pomale API, blokace dvojkliku, soucty vsech stran, chyby,
obnova pres marker bez duplicit, legacy fronty, zamky a storage eventy.
Stopky dnes nevyhledavaji novou verzi samy; testuje se zobrazeni instalovane
verze a odkaz na GitHub, aktualizaci nadale zajistuje Tampermonkey.

CI spousti Node i browserove kontroly pri pull requestu a zmenach v `main`.
Pri chybe browseroveho testu prilozi screenshot a Playwright trace jako artefakt.

### Screenshoty stavu

[Galerie screenshotu](./docs/screenshots/README.md) ukazuje vsechny stavy
pocitadla a hlavni funkce. `npm test` je na konci pregeneruje
(`npm run screenshots`) z lokalniho hriste s mocky a pevnym casem; prepise jen
obrazky, ktere se vizualne zmenily. Zmenene PNG se commituji, takze PR na
GitHubu ukaze porovnani pred/po a historie souboru i tagy uchovavaji starsi
podoby. Novy stav pridas do [tests/screenshots.visual.cjs](./tests/screenshots.visual.cjs).
CI navic prilozi Linuxovou sadu jako artefakt `screenshots-linux`.
