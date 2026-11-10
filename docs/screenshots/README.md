# Screenshoty stopek

Generovano prikazem `npm run screenshots` (soucast `npm test`) z lokalniho
playgroundu s mocky, pevnym casem a skrytym cislem verze. Needitovat rucne;
nove stavy pridej do [tests/screenshots.visual.cjs](../../tests/screenshots.visual.cjs).
Zmeny vzhledu ukazuje diff PR, starsi podoby historie souboru a Git tagy vydani.

## Stavy pocitadla

| Stav | Screenshot |
| --- | --- |
| Nic se nemeri (cervena) (`idle`) | ![Nic se nemeri (cervena)](./idle.png) |
| Mereni otevreneho tasku (zelena) (`running`) | ![Mereni otevreneho tasku (zelena)](./running.png) |
| Mereni jineho tasku (modra) (`running-other-issue`) | ![Mereni jineho tasku (modra)](./running-other-issue.png) |
| Stranka bez otevreneho tasku (`no-open-issue`) | ![Stranka bez otevreneho tasku](./no-open-issue.png) |
| STOP: ulozeny worklog a toast (`saved-toast`) | ![STOP: ulozeny worklog a toast](./saved-toast.png) |
| CANCEL: zahozene mereni a toast (`discarded-toast`) | ![CANCEL: zahozene mereni a toast](./discarded-toast.png) |
| Chyba pred ulozenim: rucni opakovani (`save-failed`) | ![Chyba pred ulozenim: rucni opakovani](./save-failed.png) |
| Ztracena odpoved: overeni markeru (`save-uncertain`) | ![Ztracena odpoved: overeni markeru](./save-uncertain.png) |

## Soucty worklogu

| Stav | Screenshot |
| --- | --- |
| Vlastni soucet vcetne subtasku (`totals-with-subtasks`) | ![Vlastni soucet vcetne subtasku](./totals-with-subtasks.png) |
| Chyba nacteni souctu (`totals-error`) | ![Chyba nacteni souctu](./totals-error.png) |

## ADD MINUTES a AUTO

| Stav | Screenshot |
| --- | --- |
| ADD MINUTES: rucni zapis 15 minut (`manual-saved`) | ![ADD MINUTES: rucni zapis 15 minut](./manual-saved.png) |
| ADD MINUTES: neplatna hodnota (`manual-invalid`) | ![ADD MINUTES: neplatna hodnota](./manual-invalid.png) |
| AUTO zapnuto: indikator v panelu (`auto-enabled`) | ![AUTO zapnuto: indikator v panelu](./auto-enabled.png) |
| AUTO: poskozene nastaveni v panelu (`auto-settings-error`) | ![AUTO: poskozene nastaveni v panelu](./auto-settings-error.png) |
| AUTO: nastaveni automatickeho vykazovani (`auto-settings`) | ![AUTO: nastaveni automatickeho vykazovani](./auto-settings.png) |
| AUTO: vykazani pri zalozeni Sub-task Bugu (`auto-worklog`) | ![AUTO: vykazani pri zalozeni Sub-task Bugu](./auto-worklog.png) |

## Ochrana stavu

| Stav | Screenshot |
| --- | --- |
| Zamek drzi jina karta (`lock-busy`) | ![Zamek drzi jina karta](./lock-busy.png) |
| Poskozeny ulozeny stav (`corrupted-state`) | ![Poskozeny ulozeny stav](./corrupted-state.png) |
