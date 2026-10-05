# Componenti locali per integrare shadcn/UI e Kibo

Per la migrazione grafica della [issue #18](https://github.com/ethos-adamas/tacitus/issues/18),
tutte le schermate di Tacitus useranno componenti locali che racchiudono le
primitive shadcn/UI e i componenti Kibo, confinando gli import delle librerie
negli adapter e mantenendo struttura delle pagine e logica applicativa in
Tacitus. Accettiamo il costo di mantenere questo confine per evitare che le
schermate dipendano direttamente dalle API dei fornitori e per concentrare
negli adapter gli adattamenti e le future sostituzioni.
