// Clasificación inicial de las filas de Alertas_QuickWins_Acciones (S01 = primera fila de datos).
// criterio: criterio del ORI al que suma · horizonte · delta: puntos 0-10 que suma al criterio cuando Rebold aprueba.
// Regla de delta: Alta 1,0 · Media 0,5 · Baja 0,3 · 0 si está descartado o es "PENDIENTE POR AUDITAR".
var SEED_CLASIFICACION = {
 "S01": {
  "criterio": "AES-5",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S02": {
  "criterio": "AES-1",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S03": {
  "criterio": "AES-5",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S04": {
  "criterio": "AES-6",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S05": {
  "criterio": "AES-1",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S06": {
  "criterio": "AES-1",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S07": {
  "criterio": "AES-1",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S08": {
  "criterio": "AES-2",
  "horizonte": "Mediano plazo",
  "delta": 0.5
 },
 "S09": {
  "criterio": "AIS-1",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S10": {
  "criterio": "UXCS-1",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S11": {
  "criterio": "UXCS-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S12": {
  "criterio": "AES-3",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S13": {
  "criterio": "AES-3",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S14": {
  "criterio": "AES-3",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S15": {
  "criterio": "AES-6",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S16": {
  "criterio": "AES-5",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S17": {
  "criterio": "AES-3",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S18": {
  "criterio": "AES-1",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S19": {
  "criterio": "AIS-2",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S20": {
  "criterio": "AIS-1",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S21": {
  "criterio": "AES-2",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S22": {
  "criterio": "CES-4",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S23": {
  "criterio": "UXCS-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S24": {
  "criterio": "AIS-1",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S25": {
  "criterio": "AES-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S26": {
  "criterio": "CES-4",
  "horizonte": "Mediano plazo",
  "delta": 0.5
 },
 "S27": {
  "criterio": "AES-4",
  "horizonte": "Largo plazo",
  "delta": 0.5
 },
 "S28": {
  "criterio": "UXCS-3",
  "horizonte": "Largo plazo",
  "delta": 0.5
 },
 "S29": {
  "criterio": "CES-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S30": {
  "criterio": "CES-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S31": {
  "criterio": "CES-3",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S32": {
  "criterio": "CES-2",
  "horizonte": "Mediano plazo",
  "delta": 0.5
 },
 "S33": {
  "criterio": "CES-5",
  "horizonte": "Mediano plazo",
  "delta": 0.5
 },
 "S34": {
  "criterio": "CES-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S35": {
  "criterio": "CES-5",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S36": {
  "criterio": "CES-2",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S37": {
  "criterio": "CES-1",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S38": {
  "criterio": "CES-2",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S39": {
  "criterio": "CES-2",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S40": {
  "criterio": "UXCS-2",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S41": {
  "criterio": "UXCS-2",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S42": {
  "criterio": "UXCS-2",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S43": {
  "criterio": "AES-6",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S44": {
  "criterio": "AIS-3",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S45": {
  "criterio": "AIS-2",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S46": {
  "criterio": "AIS-4",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S47": {
  "criterio": "AES-3",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S48": {
  "criterio": "AIS-4",
  "horizonte": "Quick win",
  "delta": 0.5
 },
 "S49": {
  "criterio": "AES-2",
  "horizonte": "Mediano plazo",
  "delta": 0.5
 },
 "S50": {
  "criterio": "AIS-5",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S51": {
  "criterio": "AIS-5",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S52": {
  "criterio": "AIS-5",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S53": {
  "criterio": "AIS-5",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S54": {
  "criterio": "AIS-5",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S55": {
  "criterio": "AIS-5",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S56": {
  "criterio": "AIS-2",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S57": {
  "criterio": "UXCS-4",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S58": {
  "criterio": "AIS-2",
  "horizonte": "Mediano plazo",
  "delta": 1.0
 },
 "S59": {
  "criterio": "CES-3",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S60": {
  "criterio": "AES-6",
  "horizonte": "Quick win",
  "delta": 0
 },
 "S61": {
  "criterio": "AES-1",
  "horizonte": "Quick win",
  "delta": 1.0
 },
 "S62": {
  "criterio": "AES-1",
  "horizonte": "Mediano plazo",
  "delta": 0.5
 },
 "S63": {
  "criterio": "CES-2",
  "horizonte": "Quick win",
  "delta": 0.5
 }
};
