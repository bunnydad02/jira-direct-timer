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

## Pouziti

- `START` spusti mereni na otevrenem ukolu. Pokud uz bezi jiny casovac,
  nejprve ulozi jeho worklog a nove mereni navaze bez mezery kvuli API.
- Samotna navigace na jiny ukol mereni neprepina.
- `STOP` zastavi a ulozi prave mereny ukol.
- `CANCEL` zahodi pouze dosud neulozene mereni.
- `ADD MINUTES` zapise kladny pocet celych minut na otevrenem ukolu.
  Potvrdit lze tlacitkem nebo klavesou Enter. Rucni zapis nemení bezici casovac.
- Panel zobrazuje celkovy dosud vykazany cas otevreneho ukolu a upozorni,
  pokud se jej nepodari nacist.
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
Jiru ani nevytvareji skutecne worklogy. CI spousti stejne kontroly pri pull
requestu a zmenach ve vetvi `main`.
