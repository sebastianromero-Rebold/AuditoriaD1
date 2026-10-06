# D1 · Rebold Audit — Cuadro de mando

Cuadro de control del primer **Rebold Audit**: Zelva reporta cada ajuste recomendado por la auditoría, Jennifer (Rebold) lo valida, y solo entonces se mueve el **ORI** (Optimization Readiness Index).

> **Estado actual: DEMO con datos ficticios.** Mientras `BACKEND_URL` esté vacío en `index.html`, el dashboard usa `demo-data.js` y guarda los cambios solo en el navegador. Las notificaciones de Slack se simulan.

## Qué muestra (de lo macro a lo micro)

| Pestaña | Contenido |
|---|---|
| 1 · ORI | ORI validado hoy, banda de lectura, línea base de la auditoría, potencial si se aprueba lo pendiente y la ruta de 6 semanas (estimada vs. validada). |
| 2 · Indicadores y criterios | AES, CES, UXCS y AIS; cada uno abierto en sus criterios con peso, score 0–10, porcentaje y aporte al indicador. |
| 3 · Seguimiento | Recomendaciones filtrables por indicador, criterio, horizonte (quick win, mediano, largo plazo), estado, validación y rango de fechas. Zelva reporta el estado y el porqué; Jennifer aprueba o devuelve. |
| 4 · Eficiencia | Tiempo de resolución de Zelva (desde la subida del hallazgo, con fecha y hora), tiempo de validación, ciclo completo, cumplimiento de fecha límite y vencidas. Exporta a CSV. |
| 5 · Bitácora | Cada alta, cambio de estado y validación con fecha, hora y usuario. Exporta a CSV. |
| 6 · Rúbrica | Consulta de la rúbrica 0–10 por criterio, con la banda actual de D1 resaltada. |

## Regla del ORI

```
score criterio = línea base (último mes de Mediciones_Mensuales) + Σ delta de los ajustes APROBADOS por Jennifer
indicador     = Σ (peso del criterio × score) × 10        ← promedio ponderado con los pesos de la hoja Criterios
ORI           = promedio de AES, CES, UXCS y AIS (25% c/u)
```

- Lo que Zelva marca como *Realizado* queda en **Pendiente validación** y no mueve el ORI. El dashboard lo muestra aparte como *potencial*.
- Al aprobar, el `delta` de la recomendación (en puntos 0–10 del criterio) se suma al criterio.
- Los `delta` del plan están calibrados para que, si se aprueba todo en orden, el ORI recorra la ruta estimada por la auditoría: 47 → 48 → 50 → 53 → 57 → 60 → 63.
- Cuando operaciones carga una medición mensual nueva, esa medición pasa a ser la línea base y solo cuentan las aprobaciones posteriores.

## Flujo

1. **Rebold** sube la recomendación → queda la fecha y hora de alta.
2. **Zelva** la marca: *En curso*, *Realizado*, *Necesita apoyo* o *No se pudo realizar* (las tres últimas exigen comentario con el porqué).
3. Cada cambio **notifica a Jennifer por Slack** con el enlace directo a la recomendación.
4. **Jennifer** aprueba (mueve el ORI), devuelve a Zelva, ratifica un cierre no realizable o registra el apoyo.
5. Todo queda en **Log_Cambios** y en un **Google Sheet de respaldo** independiente, con una copia completa (snapshot JSON) de la recomendación en cada registro.

## Puesta en producción

1. **Apps Script.** En el Google Sheet `D1_Rebold_Audit_Seguimiento`: *Extensiones → Apps Script*. Pegar `apps-script/Code.gs` y crear un archivo `Seed.gs` con `apps-script/Seed.gs`.
2. **Propiedades del script** (*Configuración del proyecto*): `ZELVA_CODE`, `REBOLD_CODE`, `VALIDADOR_CODE` (Jennifer), opcional `LECTURA_CODE`; `SLACK_BOT_TOKEN` (bot con `chat:write`; sirve el mismo bot de NewBusiness) o `SLACK_WEBHOOK_URL`; `DASHBOARD_URL`. `SLACK_JENNIFER_ID` es `U0BL3EA7KNF` por defecto. Los códigos nunca van en el repositorio.
3. Ejecutar `setup()` una vez: crea las hojas `Recomendaciones` y `Log_Cambios` y el Sheet de respaldo `D1_Rebold_Audit_Log_Respaldo`.
4. Ejecutar `seedRecomendaciones()` una vez: carga las 36 recomendaciones del plan de 6 semanas (incluye 5 de largo plazo por validar).
5. **Implementar → Nueva implementación → Aplicación web**: ejecutar como *yo*, acceso *cualquier persona*. Copiar la URL `/exec` en `CONFIG.BACKEND_URL` de `index.html`.
6. Cargar en `Mediciones_Mensuales` los 21 scores oficiales de la auditoría (mes `2026-09`). Esa es la línea base del ORI en vivo.

### Pendientes del Sheet

- `Resumen_ORI` todavía usa `AVERAGEIFS` (promedio simple). Con los pesos desiguales de `Criterios` debe ser ponderado; el dashboard ya calcula ponderado. Fórmula sugerida para AES (fila 2), igual para los demás indicadores:
  ```
  =IFERROR(ROUND(SUMPRODUCT((Mediciones_Mensuales!$A$3:$A$400=$A2)*(Mediciones_Mensuales!$C$3:$C$400="AES")*Mediciones_Mensuales!$F$3:$F$400*IFERROR(VLOOKUP(Mediciones_Mensuales!$D$3:$D$400,Criterios!$A:$E,5,0),0))/SUMPRODUCT((Mediciones_Mensuales!$A$3:$A$400=$A2)*(Mediciones_Mensuales!$C$3:$C$400="AES")*IFERROR(VLOOKUP(Mediciones_Mensuales!$D$3:$D$400,Criterios!$A:$E,5,0),0))*10,1),"")
  ```
- La línea base de la demo (AES 41 · CES 54 · UXCS 50 · AIS 43) es la reconstrucción provisional del deck. Reemplazar por los puntajes oficiales.

## Archivos

- `index.html`: el dashboard completo (HTML/CSS/JS sin dependencias).
- `demo-data.js`: datos ficticios de la demo.
- `apps-script/Code.gs`, `apps-script/Seed.gs`: backend en Google Apps Script.
- `logo_white.png`: logo de Rebold.
