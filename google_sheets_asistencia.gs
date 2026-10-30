/**
 * ============================================================================
 * UGI CCBA — Planilla de Asistencia en Google Sheets por Deporte y Categoría
 * ============================================================================
 * ¿CÓMO FUNCIONA?
 * 1. Crea 1 Google Sheet independiente por cada Deporte / Colonia dentro de la
 *    carpeta "UGI - Asistencias en Vivo" en TU cuenta de Google Drive.
 * 2. Cada planilla queda configurada en modo SOLO LECTURA (View) para que
 *    los profes y coordinadores de ese deporte puedan verla en vivo desde la app
 *    sin poder borrar ni romper nada. Si querés darle permiso de edición a
 *    alguien en particular, se lo das vos caso a caso desde el botón "Compartir"
 *    de Google Sheets.
 * 3. Adentro del Sheet se carga TODO automáticamente cada vez que toman lista:
 *    - 1 pestaña por cada Categoría / Grupo con cada alumno, su % de asistencia,
 *      presentes, tardes, ausentes, cada fecha día por día y una fila final con
 *      el % de asistencia promedio de toda la categoría y el % de cada fecha.
 *    - 1 pestaña "Resumen por Categoría" con el % de asistencia de cada grupo.
 *    - 1 pestaña "Todos los Alumnos" con el padrón completo y sus porcentajes.
 * ============================================================================
 */

const NOMBRE_CARPETA_DRIVE = 'UGI - Asistencias en Vivo';

function doGet() {
  return respuestaJSON({
    ok: true,
    mensaje: 'Script de Asistencia UGI activo.',
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);

  try {
    const payload = JSON.parse(e.postData.contents);
    const deporte = (payload.deporte || '').trim();

    if (!deporte) {
      return respuestaJSON({ ok: false, error: 'Falta el nombre del deporte' });
    }

    const ss = obtenerOCrearSheetDeporte(deporte);
    const nombresHojasActivas = [];

    // 1. Pestaña "Resumen por Categoría" con % por categoría
    if (Array.isArray(payload.resumenCategorias)) {
      escribirTablaEnHoja(ss, 'Resumen por Categoría', payload.resumenCategorias, true);
      nombresHojasActivas.push('Resumen por Categoría');
    }

    // 2. Una pestaña por cada Categoría / Grupo con alumnos, % individual y % de la categoría
    if (Array.isArray(payload.hojasPorGrupo)) {
      payload.hojasPorGrupo.forEach(function (g) {
        if (g && g.nombreHoja && Array.isArray(g.filas)) {
          escribirTablaEnHoja(ss, g.nombreHoja, g.filas, true);
          nombresHojasActivas.push(g.nombreHoja);
        }
      });
    }

    // 3. Pestaña general "Todos los Alumnos"
    if (Array.isArray(payload.matrizGeneral)) {
      escribirTablaEnHoja(ss, 'Todos los Alumnos', payload.matrizGeneral, true);
      nombresHojasActivas.push('Todos los Alumnos');
    }

    // Limpiar hojas por defecto ("Hoja 1" / "Sheet1")
    limpiarHojasSobrantes(ss, nombresHojasActivas);

    return respuestaJSON({
      ok: true,
      deporte: deporte,
      sheetUrl: ss.getUrl(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return respuestaJSON({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function obtenerOCrearCarpeta() {
  const iter = DriveApp.getFoldersByName(NOMBRE_CARPETA_DRIVE);
  if (iter.hasNext()) {
    return iter.next();
  }
  return DriveApp.createFolder(NOMBRE_CARPETA_DRIVE);
}

function obtenerOCrearSheetDeporte(deporte) {
  const props = PropertiesService.getScriptProperties();
  const propKey = 'SHEET_ID_' + deporte;
  let idGuardado = props.getProperty(propKey);
  let ss = null;

  if (idGuardado) {
    try {
      ss = SpreadsheetApp.openById(idGuardado);
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    const carpeta = obtenerOCrearCarpeta();
    const nombreArchivo = 'Asistencia UGI - ' + deporte;
    const archivos = carpeta.getFilesByName(nombreArchivo);

    if (archivos.hasNext()) {
      const existente = archivos.next();
      ss = SpreadsheetApp.openById(existente.getId());
    } else {
      ss = SpreadsheetApp.create(nombreArchivo);
      const archivoNuevo = DriveApp.getFileById(ss.getId());
      archivoNuevo.moveTo(carpeta);
    }
    props.setProperty(propKey, ss.getId());
  }

  // Asegurar siempre que el link sea de SOLO LECTURA (View) y vos manejás quién edita desde tu cuenta
  try {
    const archivo = DriveApp.getFileById(ss.getId());
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (eShare) {}

  return ss;
}

function escribirTablaEnHoja(ss, nombreHoja, filasObjetos, resaltarUltimaFila) {
  let sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) {
    sheet = ss.insertSheet(nombreHoja);
  }
  sheet.clear();

  if (!filasObjetos || filasObjetos.length === 0) {
    sheet.getRange(1, 1).setValue('Sin alumnos o asistencias cargadas aún en esta categoría.');
    return;
  }

  const encabezados = Object.keys(filasObjetos[0]);
  const matriz = [encabezados];

  filasObjetos.forEach(function (obj) {
    const fila = encabezados.map(function (col) {
      return obj[col] !== undefined && obj[col] !== null ? obj[col] : '';
    });
    matriz.push(fila);
  });

  sheet.getRange(1, 1, matriz.length, encabezados.length).setValues(matriz);

  // Encabezado azul oscuro UGI
  const rangoHeader = sheet.getRange(1, 1, 1, encabezados.length);
  rangoHeader.setFontWeight('bold');
  rangoHeader.setBackground('#082b49');
  rangoHeader.setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  // Destacar la fila final de Promedio / Totales de la Categoría si existe
  if (resaltarUltimaFila && matriz.length > 2) {
    const ultimaFilaTexto = String(matriz[matriz.length - 1][0] || '') + String(matriz[matriz.length - 1][1] || '');
    if (ultimaFilaTexto.indexOf('PROMEDIO') !== -1 || ultimaFilaTexto.indexOf('TOTAL') !== -1) {
      const rangoTotal = sheet.getRange(matriz.length, 1, 1, encabezados.length);
      rangoTotal.setFontWeight('bold');
      rangoTotal.setBackground('#e0f2fe');
      rangoTotal.setFontColor('#082b49');
    }
  }

  // Ajustar ancho de columnas automáticamente para lectura óptima
  try {
    sheet.autoResizeColumns(1, encabezados.length);
  } catch (eAuto) {}
}

function limpiarHojasSobrantes(ss, nombresActivos) {
  const hojas = ss.getSheets();
  if (hojas.length <= 1) return;
  ['Hoja 1', 'Sheet1', 'Seguimiento Vivo', 'Resumen Grupos', 'Detalle Diario'].forEach(function (nombre) {
    if (nombresActivos.indexOf(nombre) !== -1) return;
    const h = ss.getSheetByName(nombre);
    if (h && ss.getSheets().length > 1) {
      ss.deleteSheet(h);
    }
  });
}

function respuestaJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
