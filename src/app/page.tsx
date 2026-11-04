'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import {
  Utensils,
  Plus,
  Edit2,
  UserPlus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Key,
  Upload,
  FileSpreadsheet,
  Download,
  Eye,
  EyeOff,
  Check,
  Search,
  ClipboardList,
  BarChart3,
} from 'lucide-react';

// ============================================================================
// 1. CONEXIÓN A SUPABASE Y CONFIGURACIÓN OFICIAL (SOLO COLONIA Y COYFD)
// ============================================================================
const supabaseUrl = 'https://eohxmexldfjfkjdymwlm.supabase.co';
const supabaseAnonKey = 'sb_publishable_mtZs0Bn0FXsY57jHiGdFbQ_z1R03p2L';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Contraseña Maestra para Dirección UGI
const CLAVE_ADMIN = 'ugi2026';

// URL fija del Google Apps Script exclusivo para Colonia y COYFD
const GOOGLE_SCRIPT_URL_FIJA =
  'https://script.google.com/macros/s/AKfycbyocT7bZHmz4Fnd9vEwG7LBjPnheKNfoVM3Iqg0-lcaic65CfjE9tI5Y2Y3hD7D9uCm/exec';

const SHEETS_POR_AREA_FIJOS: Record<string, string> = {
  Colonia: '',
  COYFD: '',
};

// Configuración exclusiva para Colonia (con opción de comida siempre) y COYFD (sin comida)
const DEPORTES_OFICIALES = [
  {
    nombre: 'Colonia',
    tipo: 'colonia' as const,
    tieneComida: true,
    pinDefault: '1001',
    pinCoordDefault: '2001',
  },
  {
    nombre: 'COYFD',
    tipo: 'deporte' as const,
    tieneComida: false,
    pinDefault: '1002',
    pinCoordDefault: '2002',
  },
];

const tieneOpcionComida = (nombreArea: string): boolean => nombreArea === 'Colonia';

interface Grupo {
  id: number;
  nombre: string;
  categoria: string;
  tipo: 'deporte' | 'colonia';
}

interface Alumno {
  id: number;
  grupo_id: number;
  nombre: string;
  apellido: string;
  activo?: boolean;
}

interface AsistenciaState {
  estado: 'presente' | 'ausente' | 'tarde';
  almuerzo: boolean;
}

interface AlumnoImportado {
  grupo: string;
  apellido: string;
  nombre: string;
}

type RolSesion = 'profe' | 'coordinador' | 'admin';
type TabActiva = 'asistencia' | 'analisis' | 'padron' | 'config';

// Limpia viñetas, numeración y separa "Apellido, Nombre" o "Nombre Apellido"
function parsearLineaAlumno(lineaRaw: string): { apellido: string; nombre: string } | null {
  const limpia = lineaRaw
    .replace(/^\s*(\d+\s*[.)\-:]\s*|[-•*·]\s*)/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpia) return null;

  // Si viene separado por tabulación (copiado de 2 columnas de Excel)
  if (lineaRaw.includes('\t')) {
    const cols = lineaRaw
      .split('\t')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length >= 2) {
      const col0 = cols[0].replace(/^\s*\d+\s*[.)\-:]?\s*/, '').trim();
      const col1 = cols[1].trim();
      if (/^(apellido|nombre|alumno|jugador|legajo|dni|n[°º])$/i.test(col0)) return null;
      return { apellido: col0, nombre: col1 };
    }
  }

  // Formato "Apellido, Nombre" o "Apellido; Nombre"
  if (limpia.includes(',') || limpia.includes(';')) {
    const sep = limpia.includes(',') ? ',' : ';';
    const partes = limpia.split(sep).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2) {
      if (/^(apellido|nombre|alumno)$/i.test(partes[0])) return null;
      return { apellido: partes[0], nombre: partes.slice(1).join(' ') };
    }
  }

  // Formato sin coma: "Apellido Nombre" (si son 2+ palabras, tomamos la primera como Apellido y el resto como Nombre)
  const palabras = limpia.split(' ').filter(Boolean);
  if (palabras.length === 1) {
    if (/^(apellido|nombre|alumno|lista|grupo)$/i.test(palabras[0])) return null;
    return { apellido: palabras[0], nombre: '-' };
  }
  const apellido = palabras[0];
  const nombre = palabras.slice(1).join(' ');
  if (/^(apellido|nombre)$/i.test(apellido) && /^(apellido|nombre)$/i.test(nombre)) return null;
  return { apellido, nombre };
}

export default function AsistenciaColoniaCoyfdApp() {
  // Sesión y navegación estilo Deportes UGI
  const [logueado, setLogueado] = useState(false);
  const [rolSesion, setRolSesion] = useState<RolSesion>('profe');
  const [areaLogin, setAreaLogin] = useState<string>('Colonia');
  const [deporteSeleccionado, setDeporteSeleccionado] = useState<string>('Colonia');
  const [tabActiva, setTabActiva] = useState<TabActiva>('asistencia');

  // Login states
  const [inputPinDeporte, setInputPinDeporte] = useState('');
  const [mostrarPasswordLogin, setMostrarPasswordLogin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [validandoPin, setValidandoPin] = useState(false);

  // Toast de notificación estilo Deportes UGI
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrarToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2800);
  };

  // Grupos y Alumnos
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<number | null>(null);
  const [modoCategoria, setModoCategoria] = useState<'ninguno' | 'crear' | 'editar'>('ninguno');
  const [inputCategoria, setInputCategoria] = useState('');

  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [busquedaAlumno, setBusquedaAlumno] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');

  // Asistencia diaria
  const [asistencias, setAsistencias] = useState<Record<number, AsistenciaState>>({});
  const [fecha, setFecha] = useState<string>('');
  const [cargando, setCargando] = useState(false);
  const [estadoConexion, setEstadoConexion] = useState<'ok' | 'warn'>('ok');

  // Carga ágil de listados (Padrón: Texto / WhatsApp + Archivo Excel / CSV)
  const [padronCategoriaInput, setPadronCategoriaInput] = useState('');
  const [padronTextoMasivo, setPadronTextoMasivo] = useState('');
  const [cargandoMasivo, setCargandoMasivo] = useState(false);

  // Estado para subida de archivo Excel / CSV
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [archivoNombre, setArchivoNombre] = useState('');
  const [alumnosExcelPreview, setAlumnosExcelPreview] = useState<AlumnoImportado[]>([]);
  const [modoImportExcel, setModoImportExcel] = useState<'grupo_actual' | 'por_columna_o_hoja'>('grupo_actual');
  const [grupoDestinoExcel, setGrupoDestinoExcel] = useState('');

  // Estados de Análisis, Coordinación y Google Sheets
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filtroAreaAnalisis, setFiltroAreaAnalisis] = useState<string>('ACTUAL');
  const [filtroCategoriaCoord, setFiltroCategoriaCoord] = useState<string>('TODAS');
  const [registrosAdmin, setRegistrosAdmin] = useState<any[]>([]);
  const [alumnosAreaCompleta, setAlumnosAreaCompleta] = useState<Alumno[]>([]);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);

  const [googleScriptUrl, setGoogleScriptUrl] = useState(GOOGLE_SCRIPT_URL_FIJA);
  const [sheetUrlsPorDeporte, setSheetUrlsPorDeporte] =
    useState<Record<string, string>>(SHEETS_POR_AREA_FIJOS);
  const [emailsPorDeporte, setEmailsPorDeporte] = useState<Record<string, string>>({});
  const [sincronizandoSheet, setSincronizandoSheet] = useState(false);
  const [guardandoMotorGlobal, setGuardandoMotorGlobal] = useState(false);

  // Gestión de Contraseñas (Profe y Coordinación para Colonia y COYFD)
  const [pinsDeportes, setPinsDeportes] = useState<
    Record<string, { pin: string; pinCoord: string }>
  >({});
  const [deporteEditandoPin, setDeporteEditandoPin] = useState<string | null>(null);
  const [inputEditPinProfe, setInputEditPinProfe] = useState('');
  const [inputEditPinCoord, setInputEditPinCoord] = useState('');

  // ============================================================================
  // 2. INICIALIZACIÓN Y SESIÓN GUARDADA
  // ============================================================================
  useEffect(() => {
    const d = new Date();
    const hoy = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');

    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const desde30 = [
      hace30.getFullYear(),
      String(hace30.getMonth() + 1).padStart(2, '0'),
      String(hace30.getDate()).padStart(2, '0'),
    ].join('-');

    setFecha(hoy);
    setFechaDesde(desde30);
    setFechaHasta(hoy);

    try {
      const sheetsGuardados = localStorage.getItem('ugi_sheet_urls_colonia_coyfd_v2');
      if (sheetsGuardados) setSheetUrlsPorDeporte(JSON.parse(sheetsGuardados));
      const mailsGuardados = localStorage.getItem('ugi_sheet_emails_colonia_coyfd_v2');
      if (mailsGuardados) setEmailsPorDeporte(JSON.parse(mailsGuardados));

      const deporteGuardado = localStorage.getItem('ugi_deporte_logueado');
      const rolGuardado = localStorage.getItem('ugi_rol_logueado') as RolSesion | null;
      if (
        deporteGuardado &&
        (DEPORTES_OFICIALES.some((dep) => dep.nombre === deporteGuardado) ||
          deporteGuardado === 'TODOS')
      ) {
        const areaReal = deporteGuardado === 'TODOS' ? 'Colonia' : deporteGuardado;
        setAreaLogin(deporteGuardado);
        setDeporteSeleccionado(areaReal);
        if (rolGuardado === 'admin' || deporteGuardado === 'TODOS') {
          setRolSesion('admin');
          setFiltroAreaAnalisis('TODOS');
          setLogueado(true);
        } else if (rolGuardado === 'coordinador') {
          setRolSesion('coordinador');
          setFiltroAreaAnalisis('ACTUAL');
          setLogueado(true);
        } else if (rolGuardado === 'profe') {
          setRolSesion('profe');
          setLogueado(true);
        }
      }
    } catch {
      // Ignorar si localStorage no está disponible
    }

    cargarConfigAuthSupabase();
  }, []);

  const cargarConfigAuthSupabase = async () => {
    const nombresPermitidos = DEPORTES_OFICIALES.map((d) => d.nombre);
    const { data, error } = await supabase
      .from('deportes_auth')
      .select('*')
      .in('deporte', nombresPermitidos);

    if (error) {
      setEstadoConexion('warn');
      return;
    }

    setEstadoConexion('ok');
    if (data && data.length > 0) {
      const mapaUrls: Record<string, string> = {};
      const mapaMails: Record<string, string> = {};
      const mapaPins: Record<string, { pin: string; pinCoord: string }> = {};
      data.forEach((row: any) => {
        if (row.deporte) {
          mapaPins[row.deporte] = {
            pin: row.pin ? String(row.pin).trim() : '',
            pinCoord: row.pin_coord ? String(row.pin_coord).trim() : '',
          };
        }
        if (row.deporte && row.sheet_url && row.script_url === GOOGLE_SCRIPT_URL_FIJA) {
          const partes = String(row.sheet_url).split('|');
          mapaUrls[row.deporte] = partes[0];
          if (partes[1]) mapaMails[row.deporte] = partes[1];
        }
        if (row.deporte && row.email_sheet) {
          mapaMails[row.deporte] = row.email_sheet;
        }
      });
      setPinsDeportes(mapaPins);
      if (Object.keys(mapaUrls).length > 0) {
        setSheetUrlsPorDeporte((prev) => ({ ...prev, ...mapaUrls }));
      }
      if (Object.keys(mapaMails).length > 0) {
        setEmailsPorDeporte((prev) => ({ ...prev, ...mapaMails }));
      }
    }
  };

  // ============================================================================
  // 3. CARGA DE GRUPOS, ALUMNOS Y ASISTENCIAS
  // ============================================================================
  const cargarGrupos = async (deporteActual: string, idSeleccionar?: number) => {
    const nombresPermitidos = DEPORTES_OFICIALES.map((d) => d.nombre);
    const { data, error } = await supabase
      .from('grupos')
      .select('*')
      .in('nombre', nombresPermitidos)
      .order('categoria');

    if (error) {
      setEstadoConexion('warn');
      return;
    }

    setEstadoConexion('ok');
    if (data) {
      setGrupos(data);
      const filtrados = data.filter((g) => g.nombre === deporteActual);
      if (idSeleccionar && filtrados.some((g) => g.id === idSeleccionar)) {
        setGrupoSeleccionado(idSeleccionar);
      } else if (filtrados.length > 0) {
        setGrupoSeleccionado((prev) =>
          prev && filtrados.some((g) => g.id === prev) ? prev : filtrados[0].id
        );
      } else {
        setGrupoSeleccionado(null);
      }
    }
  };

  useEffect(() => {
    if (logueado) {
      cargarGrupos(deporteSeleccionado);
    }
  }, [deporteSeleccionado, logueado]);

  // Sincronizar nombre de categoría en el formulario de padrón
  useEffect(() => {
    const grp = grupos.find((g) => g.id === Number(grupoSeleccionado));
    if (grp) {
      setPadronCategoriaInput(grp.categoria);
      setGrupoDestinoExcel(grp.categoria);
    } else {
      setPadronCategoriaInput('');
      setGrupoDestinoExcel('');
    }
  }, [grupoSeleccionado, grupos]);

  const cargarAlumnosYAsistencias = async () => {
    if (!fecha || !grupoSeleccionado) {
      setAlumnos([]);
      setAsistencias({});
      return;
    }

    const permiteComida = tieneOpcionComida(deporteSeleccionado);

    const { data: alumnosData } = await supabase
      .from('alumnos')
      .select('*')
      .eq('grupo_id', grupoSeleccionado)
      .eq('activo', true)
      .order('apellido');

    if (alumnosData) {
      setAlumnos(alumnosData);
      const ids = alumnosData.map((a) => a.id);

      const mapaAsistencias: Record<number, AsistenciaState> = {};
      if (ids.length > 0) {
        const { data: asistData } = await supabase
          .from('asistencias')
          .select('*')
          .eq('fecha', fecha)
          .in('alumno_id', ids);

        alumnosData.forEach((al) => {
          const existente = asistData?.find((a) => a.alumno_id === al.id);
          if (existente) {
            mapaAsistencias[al.id] = {
              estado: existente.estado,
              almuerzo: permiteComida ? Boolean(existente.almuerzo) : false,
            };
          } else {
            mapaAsistencias[al.id] = { estado: 'presente', almuerzo: false };
          }
        });
      }
      setAsistencias(mapaAsistencias);
    }
  };

  useEffect(() => {
    if (logueado) {
      cargarAlumnosYAsistencias();
    }
  }, [grupoSeleccionado, fecha, deporteSeleccionado, logueado]);

  // Cargar datos para la pestaña Análisis (Coordinación / Dirección UGI)
  const cargarReporteMaestro = async () => {
    if (!fechaDesde || !fechaHasta) return;
    setCargandoAdmin(true);

    const nombresPermitidos = DEPORTES_OFICIALES.map((d) => d.nombre);

    const [asistRes, alumnosRes] = await Promise.all([
      supabase
        .from('asistencias')
        .select(
          `
          id,
          fecha,
          estado,
          almuerzo,
          alumno_id,
          alumnos (
            id,
            nombre,
            apellido,
            grupo_id,
            grupos (
              id,
              nombre,
              categoria,
              tipo
            )
          )
        `
        )
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha', { ascending: false }),
      supabase.from('alumnos').select('*').eq('activo', true).order('apellido'),
    ]);

    if (!asistRes.error && asistRes.data) {
      const soloColoniaYCoyfd = asistRes.data.filter((r: any) =>
        nombresPermitidos.includes(r.alumnos?.grupos?.nombre)
      );
      setRegistrosAdmin(soloColoniaYCoyfd);
    }
    if (!alumnosRes.error && alumnosRes.data) {
      setAlumnosAreaCompleta(alumnosRes.data);
    }
    setCargandoAdmin(false);
  };

  useEffect(() => {
    if (logueado && tabActiva === 'analisis') {
      cargarReporteMaestro();
    }
  }, [logueado, tabActiva, fechaDesde, fechaHasta, deporteSeleccionado]);

  // ============================================================================
  // 4. LOGIN CON CONTRASEÑA PARA PROFE, COORDINACIÓN Y DIRECCIÓN UGI
  // ============================================================================
  const ingresarApp = async (e: React.FormEvent) => {
    e.preventDefault();
    const clave = inputPinDeporte.trim();
    if (!clave) {
      setLoginError('Ingresá tu contraseña para continuar.');
      return;
    }

    setValidandoPin(true);
    setLoginError('');

    const { data: filasAuth } = await supabase
      .from('deportes_auth')
      .select('*')
      .in(
        'deporte',
        DEPORTES_OFICIALES.map((d) => d.nombre)
      );

    setValidandoPin(false);

    const obtenerClavesArea = (nombreArea: string) => {
      const def = DEPORTES_OFICIALES.find((d) => d.nombre === nombreArea)!;
      const fila = filasAuth?.find((r: any) => r.deporte === nombreArea);
      return {
        profe: fila?.pin ? String(fila.pin).trim() : def.pinDefault,
        coord: fila?.pin_coord ? String(fila.pin_coord).trim() : def.pinCoordDefault,
      };
    };

    // 1. Si ingresó la clave maestra de Dirección UGI
    if (clave.toLowerCase() === CLAVE_ADMIN) {
      const areaInicial = areaLogin === 'TODOS' ? 'Colonia' : areaLogin;
      try {
        localStorage.setItem('ugi_deporte_logueado', areaLogin);
        localStorage.setItem('ugi_rol_logueado', 'admin');
      } catch {}
      setDeporteSeleccionado(areaInicial);
      setRolSesion('admin');
      setFiltroAreaAnalisis(areaLogin === 'TODOS' ? 'TODOS' : 'ACTUAL');
      setTabActiva(areaLogin === 'TODOS' ? 'analisis' : 'asistencia');
      setInputPinDeporte('');
      setLogueado(true);
      return;
    }

    if (areaLogin === 'TODOS') {
      setLoginError('Contraseña de Dirección UGI incorrecta.');
      return;
    }

    // 2. Validar clave de Profe o Coordinación para el área elegida (Colonia o COYFD)
    const clavesActual = obtenerClavesArea(areaLogin);
    const otraArea = areaLogin === 'Colonia' ? 'COYFD' : 'Colonia';
    const clavesOtra = obtenerClavesArea(otraArea);

    if (clave === clavesActual.coord) {
      try {
        localStorage.setItem('ugi_deporte_logueado', areaLogin);
        localStorage.setItem('ugi_rol_logueado', 'coordinador');
      } catch {}
      setDeporteSeleccionado(areaLogin);
      setRolSesion('coordinador');
      setFiltroAreaAnalisis('ACTUAL');
      setFiltroCategoriaCoord('TODAS');
      setTabActiva('asistencia');
      setInputPinDeporte('');
      setLogueado(true);
      return;
    }

    if (clave === clavesActual.profe) {
      try {
        localStorage.setItem('ugi_deporte_logueado', areaLogin);
        localStorage.setItem('ugi_rol_logueado', 'profe');
      } catch {}
      setDeporteSeleccionado(areaLogin);
      setRolSesion('profe');
      setTabActiva('asistencia');
      setInputPinDeporte('');
      setLogueado(true);
      return;
    }

    if (clave === clavesOtra.profe || clave === clavesOtra.coord) {
      setLoginError(`Esa contraseña corresponde a ${otraArea}, no a ${areaLogin}.`);
      return;
    }

    setLoginError(`Contraseña incorrecta para ${areaLogin}.`);
  };

  const cerrarSesion = () => {
    try {
      localStorage.removeItem('ugi_deporte_logueado');
      localStorage.removeItem('ugi_rol_logueado');
    } catch {}
    setLogueado(false);
    setInputPinDeporte('');
    setLoginError('');
    setModoCategoria('ninguno');
  };

  // ============================================================================
  // 5. GESTIÓN DE CATEGORÍAS / GRUPOS Y CARGA ÁGIL DE LISTADOS
  // ============================================================================
  const asegurarGrupoEnSupabase = async (
    nombreArea: string,
    nombreCat: string
  ): Promise<Grupo | null> => {
    const catLimpia = nombreCat.trim();
    if (!catLimpia) return null;

    const existente = grupos.find(
      (g) =>
        g.nombre === nombreArea &&
        g.categoria.trim().toLowerCase() === catLimpia.toLowerCase()
    );
    if (existente) return existente;

    // Verificar en base de datos por si no estaba en estado local
    const { data: enDb } = await supabase
      .from('grupos')
      .select('*')
      .eq('nombre', nombreArea)
      .ilike('categoria', catLimpia)
      .maybeSingle();

    if (enDb) return enDb as Grupo;

    const infoArea = DEPORTES_OFICIALES.find((d) => d.nombre === nombreArea)!;
    const { data: creado, error } = await supabase
      .from('grupos')
      .insert([
        {
          nombre: nombreArea,
          categoria: catLimpia,
          tipo: infoArea.tipo,
        },
      ])
      .select()
      .single();

    if (error || !creado) {
      mostrarToast('Error al crear grupo: ' + (error?.message || ''));
      return null;
    }
    return creado as Grupo;
  };

  const guardarCategoria = async () => {
    if (!inputCategoria.trim()) return;
    const infoDeporte = DEPORTES_OFICIALES.find((d) => d.nombre === deporteSeleccionado)!;

    if (modoCategoria === 'crear') {
      const { data, error } = await supabase
        .from('grupos')
        .insert([
          {
            nombre: deporteSeleccionado,
            categoria: inputCategoria.trim(),
            tipo: infoDeporte.tipo,
          },
        ])
        .select()
        .single();

      if (error) {
        mostrarToast('Error al crear grupo: ' + error.message);
      } else if (data) {
        setModoCategoria('ninguno');
        setInputCategoria('');
        await cargarGrupos(deporteSeleccionado, data.id);
        mostrarToast(`Grupo "${data.categoria}" creado`);
      }
    } else if (modoCategoria === 'editar' && grupoSeleccionado) {
      const { error } = await supabase
        .from('grupos')
        .update({ categoria: inputCategoria.trim() })
        .eq('id', grupoSeleccionado);

      if (error) {
        mostrarToast('Error al renombrar grupo: ' + error.message);
      } else {
        setModoCategoria('ninguno');
        setInputCategoria('');
        await cargarGrupos(deporteSeleccionado, grupoSeleccionado);
        mostrarToast('Nombre del grupo actualizado');
      }
    }
  };

  // Carga masiva pegando texto desde WhatsApp o Excel
  const cargarListadoMasivoTexto = async (e: React.FormEvent) => {
    e.preventDefault();
    const catDestino = padronCategoriaInput.trim();
    if (!catDestino) {
      mostrarToast('Escribí o elegí el nombre del grupo primero');
      return;
    }

    const lineas = padronTextoMasivo.split(/\r?\n/);
    const parseados = lineas
      .map(parsearLineaAlumno)
      .filter((x): x is { apellido: string; nombre: string } => Boolean(x));

    if (parseados.length === 0) {
      mostrarToast('Pegá al menos un alumno en la lista');
      return;
    }

    setCargandoMasivo(true);
    const grupoObj = await asegurarGrupoEnSupabase(deporteSeleccionado, catDestino);
    if (!grupoObj) {
      setCargandoMasivo(false);
      return;
    }

    // Traer alumnos actuales del grupo para no duplicar
    const { data: actuales } = await supabase
      .from('alumnos')
      .select('id, nombre, apellido')
      .eq('grupo_id', grupoObj.id)
      .eq('activo', true);

    const clavesActuales = new Set(
      (actuales || []).map(
        (a) => `${a.apellido.trim().toLowerCase()}|${a.nombre.trim().toLowerCase()}`
      )
    );

    const nuevosAInsertar: {
      grupo_id: number;
      apellido: string;
      nombre: string;
      activo: boolean;
    }[] = [];

    parseados.forEach((al) => {
      const clave = `${al.apellido.trim().toLowerCase()}|${al.nombre.trim().toLowerCase()}`;
      if (!clavesActuales.has(clave)) {
        clavesActuales.add(clave);
        nuevosAInsertar.push({
          grupo_id: grupoObj.id,
          apellido: al.apellido.trim(),
          nombre: al.nombre.trim(),
          activo: true,
        });
      }
    });

    if (nuevosAInsertar.length > 0) {
      const { error } = await supabase.from('alumnos').insert(nuevosAInsertar);
      if (error) {
        setCargandoMasivo(false);
        mostrarToast('Error al subir listado: ' + error.message);
        return;
      }
    }

    setPadronTextoMasivo('');
    await cargarGrupos(deporteSeleccionado, grupoObj.id);
    await cargarAlumnosYAsistencias();
    setCargandoMasivo(false);

    if (nuevosAInsertar.length === 0) {
      mostrarToast('Todos esos alumnos ya estaban en el grupo');
    } else {
      mostrarToast(`¡${nuevosAInsertar.length} alumnos cargados en ${grupoObj.categoria}!`);
    }
  };

  // Procesar archivo Excel (.xlsx, .xls) o CSV (.csv)
  const manejarArchivoExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArchivoNombre(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const detectados: AlumnoImportado[] = [];
      let detectoMultiplesGrupos = false;
      const gruposVistos = new Set<string>();

      wb.SheetNames.forEach((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return;
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!rows || rows.length === 0) return;

        // Buscar fila de encabezado si existe
        let idxGrupo = -1;
        let idxApellido = -1;
        let idxNombre = -1;
        let idxNombreCompleto = -1;
        let filaInicio = 0;

        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const r = rows[i].map((c) => String(c || '').trim().toLowerCase());
          const gCol = r.findIndex((c) =>
            /^(grupo|categor[ií]a|sala|turno|equipo|comisi[oó]n)$/.test(c)
          );
          const apCol = r.findIndex((c) => /^(apellido|apellidos)$/.test(c));
          const nomCol = r.findIndex((c) => /^(nombre|nombres)$/.test(c));
          const fullCol = r.findIndex((c) =>
            /^(alumno|alumnos|nombre y apellido|apellido y nombre|jugador|participante)$/.test(c)
          );

          if (apCol !== -1 || fullCol !== -1 || (gCol !== -1 && nomCol !== -1)) {
            idxGrupo = gCol;
            idxApellido = apCol;
            idxNombre = nomCol;
            idxNombreCompleto = fullCol;
            filaInicio = i + 1;
            break;
          }
        }

        const nombreHojaLimpio =
          wb.SheetNames.length > 1 && !/^hoja\s*\d+|^sheet\s*\d+/i.test(sheetName.trim())
            ? sheetName.trim()
            : '';

        for (let rIdx = filaInicio; rIdx < rows.length; rIdx++) {
          const fila = rows[rIdx];
          if (!Array.isArray(fila)) continue;
          const celdasNoVacias = fila.map((c) => String(c ?? '').trim()).filter(Boolean);
          if (celdasNoVacias.length === 0) continue;

          const grupoFila =
            idxGrupo !== -1 && String(fila[idxGrupo] ?? '').trim()
              ? String(fila[idxGrupo]).trim()
              : nombreHojaLimpio || grupoDestinoExcel || padronCategoriaInput || 'Grupo General';

          let apellido = '';
          let nombre = '';

          if (idxApellido !== -1 && idxNombre !== -1) {
            apellido = String(fila[idxApellido] ?? '').trim();
            nombre = String(fila[idxNombre] ?? '').trim() || '-';
          } else if (idxNombreCompleto !== -1) {
            const parsed = parsearLineaAlumno(String(fila[idxNombreCompleto] ?? ''));
            if (parsed) {
              apellido = parsed.apellido;
              nombre = parsed.nombre;
            }
          } else if (celdasNoVacias.length >= 2 && !celdasNoVacias[0].includes(',')) {
            // Si hay 2 columnas sin encabezado claro: Col 0 = Apellido, Col 1 = Nombre
            const c0 = celdasNoVacias[0].replace(/^\d+\s*[.)\-:]?\s*/, '').trim();
            const c1 = celdasNoVacias[1].trim();
            if (/^(apellido|nombre|alumno|grupo|categor[ií]a)$/i.test(c0)) continue;
            apellido = c0;
            nombre = c1;
          } else {
            const parsed = parsearLineaAlumno(celdasNoVacias[0]);
            if (parsed) {
              apellido = parsed.apellido;
              nombre = parsed.nombre;
            }
          }

          if (apellido && !/^(total|promedio|subtotal|alumno|apellido)$/i.test(apellido)) {
            gruposVistos.add(grupoFila);
            detectados.push({
              grupo: grupoFila,
              apellido,
              nombre: nombre || '-',
            });
          }
        }
      });

      if (gruposVistos.size > 1) {
        detectoMultiplesGrupos = true;
        setModoImportExcel('por_columna_o_hoja');
      } else {
        setModoImportExcel('grupo_actual');
      }

      setAlumnosExcelPreview(detectados);
      if (detectados.length === 0) {
        mostrarToast('No se encontraron nombres válidos en el archivo');
      } else {
        mostrarToast(
          `${detectados.length} alumnos leídos del archivo${
            detectoMultiplesGrupos ? ` (${gruposVistos.size} grupos)` : ''
          }`
        );
      }
    } catch {
      mostrarToast('No se pudo leer el archivo Excel / CSV');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmarImportacionExcel = async () => {
    if (alumnosExcelPreview.length === 0) return;

    const grupoUnico = (grupoDestinoExcel || padronCategoriaInput).trim();
    if (modoImportExcel === 'grupo_actual' && !grupoUnico) {
      mostrarToast('Indicá a qué grupo querés subir el listado');
      return;
    }

    setCargandoMasivo(true);
    let totalInsertados = 0;
    let ultimoGrupoId: number | undefined;

    // Agrupar por nombre de grupo destino
    const mapaPorGrupo = new Map<string, { apellido: string; nombre: string }[]>();
    alumnosExcelPreview.forEach((item) => {
      const gDestino =
        modoImportExcel === 'grupo_actual' ? grupoUnico : item.grupo || grupoUnico || 'General';
      if (!mapaPorGrupo.has(gDestino)) mapaPorGrupo.set(gDestino, []);
      mapaPorGrupo.get(gDestino)!.push({ apellido: item.apellido, nombre: item.nombre });
    });

    for (const [nombreGrupo, listaAls] of mapaPorGrupo.entries()) {
      const grp = await asegurarGrupoEnSupabase(deporteSeleccionado, nombreGrupo);
      if (!grp) continue;
      ultimoGrupoId = grp.id;

      const { data: actuales } = await supabase
        .from('alumnos')
        .select('apellido, nombre')
        .eq('grupo_id', grp.id)
        .eq('activo', true);

      const existentesSet = new Set(
        (actuales || []).map(
          (a) => `${a.apellido.trim().toLowerCase()}|${a.nombre.trim().toLowerCase()}`
        )
      );

      const paraInsertar: {
        grupo_id: number;
        apellido: string;
        nombre: string;
        activo: boolean;
      }[] = [];

      listaAls.forEach((al) => {
        const key = `${al.apellido.trim().toLowerCase()}|${al.nombre.trim().toLowerCase()}`;
        if (!existentesSet.has(key)) {
          existentesSet.add(key);
          paraInsertar.push({
            grupo_id: grp.id,
            apellido: al.apellido.trim(),
            nombre: al.nombre.trim(),
            activo: true,
          });
        }
      });

      if (paraInsertar.length > 0) {
        const { error } = await supabase.from('alumnos').insert(paraInsertar);
        if (!error) totalInsertados += paraInsertar.length;
      }
    }

    setAlumnosExcelPreview([]);
    setArchivoNombre('');
    await cargarGrupos(deporteSeleccionado, ultimoGrupoId);
    await cargarAlumnosYAsistencias();
    setCargandoMasivo(false);
    mostrarToast(`¡Listo! Se sumaron ${totalInsertados} alumnos desde el archivo.`);
  };

  const descargarPlantillaExcel = () => {
    const grupoEjemplo =
      grupos.find((g) => g.id === Number(grupoSeleccionado))?.categoria || 'Grupo 1';
    const datosPlantilla = [
      { Grupo: grupoEjemplo, Apellido: 'Gómez', Nombre: 'Juan' },
      { Grupo: grupoEjemplo, Apellido: 'Pérez', Nombre: 'Mateo' },
      { Grupo: grupoEjemplo, Apellido: 'Rodríguez', Nombre: 'Lucía' },
    ];
    const ws = XLSX.utils.json_to_sheet(datosPlantilla);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Listado');
    XLSX.writeFile(wb, `Plantilla_Listado_${deporteSeleccionado}.xlsx`);
  };

  // Agregar Alumno Individual
  const agregarAlumnoIndividual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grupoSeleccionado || !nuevoApellido.trim() || !nuevoNombre.trim()) return;

    const { error } = await supabase.from('alumnos').insert([
      {
        grupo_id: grupoSeleccionado,
        apellido: nuevoApellido.trim(),
        nombre: nuevoNombre.trim(),
        activo: true,
      },
    ]);

    if (error) {
      mostrarToast('Error al agregar alumno: ' + error.message);
    } else {
      const nombreAgregado = `${nuevoApellido.trim()}, ${nuevoNombre.trim()}`;
      setNuevoApellido('');
      setNuevoNombre('');
      await cargarAlumnosYAsistencias();
      mostrarToast(`${nombreAgregado} sumado al grupo`);
    }
  };

  // Dar de baja alumno
  const eliminarAlumno = async (id: number, nombreCompleto: string) => {
    if (!confirm(`¿Quitar a ${nombreCompleto} de este grupo?`)) return;
    await supabase.from('alumnos').update({ activo: false }).eq('id', id);
    await cargarAlumnosYAsistencias();
    mostrarToast(`${nombreCompleto} quitado`);
  };

  // Vaciar grupo completo (por recambio de listado)
  const vaciarGrupoActual = async () => {
    const grp = grupos.find((g) => g.id === Number(grupoSeleccionado));
    if (!grp || alumnos.length === 0) return;
    if (
      !confirm(
        `¿Seguro que querés quitar a los ${alumnos.length} alumnos actuales de "${grp.categoria}" para cargar una lista nueva?`
      )
    ) {
      return;
    }
    await supabase.from('alumnos').update({ activo: false }).eq('grupo_id', grp.id);
    await cargarAlumnosYAsistencias();
    mostrarToast(`Se vació el listado de ${grp.categoria}`);
  };

  // ============================================================================
  // 6. TOMAR Y GUARDAR ASISTENCIA (CON COMIDA EN COLONIA Y SIN COMIDA EN COYFD)
  // ============================================================================
  const handleEstado = (id: number, nuevoEstado: 'presente' | 'ausente' | 'tarde') => {
    const permiteComida = tieneOpcionComida(deporteSeleccionado);
    setAsistencias((prev) => ({
      ...prev,
      [id]: {
        estado: nuevoEstado,
        almuerzo:
          !permiteComida || nuevoEstado === 'ausente'
            ? false
            : prev[id]?.almuerzo || false,
      },
    }));
  };

  const handleAlmuerzo = (id: number) => {
    if (!tieneOpcionComida(deporteSeleccionado)) return;
    setAsistencias((prev) => {
      const actual = prev[id] || { estado: 'presente', almuerzo: false };
      const nuevoAlmuerzo = !actual.almuerzo;
      // Si estaba ausente y le marcan comida, pasa automáticamente a presente
      const nuevoEstado =
        nuevoAlmuerzo && actual.estado === 'ausente' ? 'presente' : actual.estado;
      return {
        ...prev,
        [id]: {
          estado: nuevoEstado,
          almuerzo: nuevoAlmuerzo,
        },
      };
    });
  };

  const marcarTodosPresentes = () => {
    const permiteComida = tieneOpcionComida(deporteSeleccionado);
    setAsistencias((prev) => {
      const nuevo: Record<number, AsistenciaState> = { ...prev };
      alumnos.forEach((al) => {
        nuevo[al.id] = {
          estado: 'presente',
          almuerzo: permiteComida ? prev[al.id]?.almuerzo || false : false,
        };
      });
      return nuevo;
    });
    mostrarToast('Todos marcados Presente (P)');
  };

  const marcarTodosComida = (activar: boolean) => {
    if (!tieneOpcionComida(deporteSeleccionado)) return;
    setAsistencias((prev) => {
      const nuevo: Record<number, AsistenciaState> = { ...prev };
      alumnos.forEach((al) => {
        const est = prev[al.id]?.estado || 'presente';
        nuevo[al.id] = {
          estado: est,
          almuerzo: est === 'ausente' ? false : activar,
        };
      });
      return nuevo;
    });
    mostrarToast(
      activar
        ? 'Comida marcada a todos los presentes'
        : 'Se desmarcó la comida del grupo'
    );
  };

  const guardarAsistencias = async () => {
    if (alumnos.length === 0) return;
    setCargando(true);
    const permiteComida = tieneOpcionComida(deporteSeleccionado);

    const registros = alumnos.map((al) => {
      const est = asistencias[al.id]?.estado || 'presente';
      return {
        fecha,
        alumno_id: al.id,
        estado: est,
        almuerzo: permiteComida && est !== 'ausente' ? Boolean(asistencias[al.id]?.almuerzo) : false,
      };
    });

    const { error } = await supabase
      .from('asistencias')
      .upsert(registros, { onConflict: 'fecha,alumno_id' });
    setCargando(false);

    if (error) {
      mostrarToast('Error al guardar: ' + error.message);
    } else {
      mostrarToast(`✓ Asistencia de ${deporteSeleccionado} guardada`);
      if (googleScriptUrl.trim()) {
        sincronizarGoogleSheetDeporte(deporteSeleccionado, false);
      }
    }
  };

  // ============================================================================
  // 7. SINCRONIZACIÓN CON GOOGLE SHEETS Y GESTIÓN DE CLAVES
  // ============================================================================
  const guardarPinsAdmin = async (deporte: string) => {
    const nuevoProfe = inputEditPinProfe.trim();
    const nuevoCoord = inputEditPinCoord.trim();
    if (!nuevoProfe || !nuevoCoord) {
      mostrarToast('Completá ambas contraseñas');
      return;
    }
    const { error } = await supabase.from('deportes_auth').upsert(
      {
        deporte,
        pin: nuevoProfe,
        pin_coord: nuevoCoord,
      },
      { onConflict: 'deporte' }
    );

    if (error) {
      mostrarToast('Error al guardar claves: ' + error.message);
    } else {
      setPinsDeportes((prev) => ({
        ...prev,
        [deporte]: { pin: nuevoProfe, pinCoord: nuevoCoord },
      }));
      setDeporteEditandoPin(null);
      mostrarToast(`Contraseñas de ${deporte} actualizadas`);
    }
  };

  const guardarMotorEnSupabase = async () => {
    const urlLimpia = googleScriptUrl.trim();
    if (!urlLimpia) {
      mostrarToast('Pegá primero la URL que termina en /exec');
      return;
    }
    setGuardandoMotorGlobal(true);
    const nombresPermitidos = DEPORTES_OFICIALES.map((d) => d.nombre);
    const { error } = await supabase
      .from('deportes_auth')
      .update({ script_url: urlLimpia })
      .in('deporte', nombresPermitidos);

    setGuardandoMotorGlobal(false);
    if (error) {
      mostrarToast('Error al guardar URL: ' + error.message);
    } else {
      mostrarToast('URL de Google Script guardada');
    }
  };

  const sincronizarGoogleSheetDeporte = async (
    nombreDeporte: string,
    mostrarAlerta = true,
    abrirAlTerminar = false
  ) => {
    const urlDestino = (googleScriptUrl || GOOGLE_SCRIPT_URL_FIJA).trim();
    if (!urlDestino) return;

    const emailDeporte = (emailsPorDeporte[nombreDeporte] || '').trim();
    const esColoniaDeporte = tieneOpcionComida(nombreDeporte);

    setSincronizandoSheet(true);
    try {
      const { data: gruposDeporte } = await supabase
        .from('grupos')
        .select('*')
        .eq('nombre', nombreDeporte)
        .order('categoria');

      const listaGrupos = gruposDeporte || [];
      const idsGrupos = listaGrupos.map((g) => g.id);

      let alumnosDeporte: any[] = [];
      if (idsGrupos.length > 0) {
        const { data: als } = await supabase
          .from('alumnos')
          .select('*')
          .in('grupo_id', idsGrupos)
          .eq('activo', true)
          .order('apellido');
        alumnosDeporte = als || [];
      }

      const idsAlumnos = alumnosDeporte.map((a) => a.id);
      let asistenciasHist: any[] = [];
      if (idsAlumnos.length > 0) {
        const { data: asistData } = await supabase
          .from('asistencias')
          .select('*')
          .in('alumno_id', idsAlumnos)
          .order('fecha', { ascending: true });
        asistenciasHist = asistData || [];
      }

      const mapaGrupoPorId = new Map(listaGrupos.map((g) => [g.id, g]));

      const construirTablaConPorcentajes = (
        listaAlumnos: any[],
        fechasColumnas: string[],
        etiquetaPromedio: string
      ) => {
        if (listaAlumnos.length === 0) {
          return [
            {
              Categoría: etiquetaPromedio,
              Alumno: 'Sin alumnos cargados aún',
              '% Asistencia': '-',
              Presentes: 0,
              Tardes: 0,
              Ausentes: 0,
              'Clases Tomadas': 0,
            },
          ];
        }

        let sumaPresTarde = 0;
        let sumaTotal = 0;
        let sumaPres = 0;
        let sumaTard = 0;
        let sumaAus = 0;
        let sumaAlm = 0;

        const filasAlumnos = listaAlumnos.map((al) => {
          const gr = mapaGrupoPorId.get(al.grupo_id);
          const regsAlumno = asistenciasHist.filter((a) => a.alumno_id === al.id);
          const presentes = regsAlumno.filter((a) => a.estado === 'presente').length;
          const tardes = regsAlumno.filter((a) => a.estado === 'tarde').length;
          const ausentes = regsAlumno.filter((a) => a.estado === 'ausente').length;
          const almuerzos = regsAlumno.filter((a) => a.almuerzo).length;
          const totalDias = regsAlumno.length;

          sumaPres += presentes;
          sumaTard += tardes;
          sumaAus += ausentes;
          sumaAlm += almuerzos;
          sumaPresTarde += presentes + tardes;
          sumaTotal += totalDias;

          const pctAlumno =
            totalDias > 0 ? `${Math.round(((presentes + tardes) / totalDias) * 100)}%` : '-';

          const fila: Record<string, any> = {
            Categoría: gr?.categoria || '',
            Alumno: `${al.apellido}, ${al.nombre}`,
            '% Asistencia': pctAlumno,
            Presentes: presentes,
            Tardes: tardes,
            Ausentes: ausentes,
            'Clases Tomadas': totalDias,
          };

          if (esColoniaDeporte) {
            fila.Almuerzos = almuerzos;
          }

          fechasColumnas.forEach((f) => {
            const reg = regsAlumno.find((r) => r.fecha === f);
            if (!reg) {
              fila[f] = '-';
            } else {
              const letra =
                reg.estado === 'presente' ? 'P' : reg.estado === 'tarde' ? 'T' : 'A';
              fila[f] = esColoniaDeporte && reg.almuerzo ? `${letra} (Alm)` : letra;
            }
          });

          return fila;
        });

        const pctPromedioCategoria =
          sumaTotal > 0 ? `${Math.round((sumaPresTarde / sumaTotal) * 100)}%` : '-';

        const filaPromedio: Record<string, any> = {
          Categoría: etiquetaPromedio,
          Alumno: `PROMEDIO / TOTAL (${listaAlumnos.length} alumnos)`,
          '% Asistencia': pctPromedioCategoria,
          Presentes: sumaPres,
          Tardes: sumaTard,
          Ausentes: sumaAus,
          'Clases Tomadas': fechasColumnas.length,
        };

        if (esColoniaDeporte) {
          filaPromedio.Almuerzos = sumaAlm;
        }

        const idsSet = new Set(listaAlumnos.map((a) => a.id));
        fechasColumnas.forEach((f) => {
          const regsDia = asistenciasHist.filter(
            (r) => r.fecha === f && idsSet.has(r.alumno_id)
          );
          if (regsDia.length === 0) {
            filaPromedio[f] = '-';
          } else {
            const asistDia = regsDia.filter(
              (r) => r.estado === 'presente' || r.estado === 'tarde'
            ).length;
            const pctDia = Math.round((asistDia / regsDia.length) * 100);
            filaPromedio[f] = `${pctDia}% (${asistDia}/${regsDia.length})`;
          }
        });

        return [...filasAlumnos, filaPromedio];
      };

      let totalAlumnosDeporte = 0;
      let totalPresDeporte = 0;
      let totalTardDeporte = 0;
      let totalAusDeporte = 0;
      let totalRegsDeporte = 0;
      let totalAlmDeporte = 0;

      const resumenCategorias = listaGrupos.map((gr) => {
        const alsGrupo = alumnosDeporte.filter((a) => a.grupo_id === gr.id);
        const idsAlsGrupo = new Set(alsGrupo.map((a) => a.id));
        const regsGrupo = asistenciasHist.filter((r) => idsAlsGrupo.has(r.alumno_id));
        const fechasGrupo = Array.from(new Set(regsGrupo.map((r) => r.fecha)));

        const pres = regsGrupo.filter((r) => r.estado === 'presente').length;
        const tard = regsGrupo.filter((r) => r.estado === 'tarde').length;
        const aus = regsGrupo.filter((r) => r.estado === 'ausente').length;
        const alm = regsGrupo.filter((r) => r.almuerzo).length;
        const total = regsGrupo.length;

        totalAlumnosDeporte += alsGrupo.length;
        totalPresDeporte += pres;
        totalTardDeporte += tard;
        totalAusDeporte += aus;
        totalRegsDeporte += total;
        totalAlmDeporte += alm;

        const pctAsist = total > 0 ? `${Math.round(((pres + tard) / total) * 100)}%` : '-';
        const pctAus = total > 0 ? `${Math.round((aus / total) * 100)}%` : '-';

        const filaRes: Record<string, any> = {
          Categoría: gr.categoria,
          Alumnos: alsGrupo.length,
          'Días Cargados': fechasGrupo.length,
          '% Asistencia': pctAsist,
          '% Ausentismo': pctAus,
          Presentes: pres,
          Tardes: tard,
          Ausentes: aus,
        };
        if (esColoniaDeporte) {
          filaRes.Almuerzos = alm;
        }
        return filaRes;
      });

      if (resumenCategorias.length > 0) {
        const pctTotalAsist =
          totalRegsDeporte > 0
            ? `${Math.round(((totalPresDeporte + totalTardDeporte) / totalRegsDeporte) * 100)}%`
            : '-';
        const pctTotalAus =
          totalRegsDeporte > 0
            ? `${Math.round((totalAusDeporte / totalRegsDeporte) * 100)}%`
            : '-';
        const filaTotalDeporte: Record<string, any> = {
          Categoría: `PROMEDIO GENERAL ${nombreDeporte.toUpperCase()}`,
          Alumnos: totalAlumnosDeporte,
          'Días Cargados': Array.from(new Set(asistenciasHist.map((a) => a.fecha))).length,
          '% Asistencia': pctTotalAsist,
          '% Ausentismo': pctTotalAus,
          Presentes: totalPresDeporte,
          Tardes: totalTardDeporte,
          Ausentes: totalAusDeporte,
        };
        if (esColoniaDeporte) {
          filaTotalDeporte.Almuerzos = totalAlmDeporte;
        }
        resumenCategorias.push(filaTotalDeporte);
      }

      const hojasPorGrupo = listaGrupos.map((gr, idx) => {
        const alsGrupo = alumnosDeporte.filter((a) => a.grupo_id === gr.id);
        const idsAlsGrupo = new Set(alsGrupo.map((a) => a.id));
        const fechasCat = Array.from(
          new Set(
            asistenciasHist
              .filter((r) => idsAlsGrupo.has(r.alumno_id))
              .map((r) => r.fecha)
          )
        ).sort();

        const nombreLimpio = gr.categoria
          .replace(/[\\/?*[\]:]/g, ' ')
          .trim()
          .slice(0, 25);

        return {
          nombreHoja: nombreLimpio || `Grupo_${idx + 1}`,
          filas: construirTablaConPorcentajes(alsGrupo, fechasCat, gr.categoria),
        };
      });

      const fechasGenerales = Array.from(new Set(asistenciasHist.map((a) => a.fecha))).sort();
      const matrizGeneral = construirTablaConPorcentajes(
        alumnosDeporte,
        fechasGenerales,
        nombreDeporte
      );

      const resp = await fetch(urlDestino, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          deporte: nombreDeporte,
          email: emailDeporte,
          resumenCategorias,
          hojasPorGrupo,
          matrizGeneral,
        }),
      });

      const resJson = await resp.json();
      if (resJson && resJson.ok && resJson.sheetUrl) {
        setSheetUrlsPorDeporte((prev) => {
          const nuevo = { ...prev, [nombreDeporte]: resJson.sheetUrl };
          try {
            localStorage.setItem('ugi_sheet_urls_colonia_coyfd_v2', JSON.stringify(nuevo));
          } catch {}
          return nuevo;
        });

        await supabase.from('deportes_auth').upsert(
          {
            deporte: nombreDeporte,
            sheet_url: resJson.sheetUrl,
            script_url: urlDestino,
          },
          { onConflict: 'deporte' }
        );

        if (abrirAlTerminar) {
          window.open(resJson.sheetUrl, '_blank', 'noopener,noreferrer');
        } else if (mostrarAlerta) {
          mostrarToast(`Google Sheet de ${nombreDeporte} actualizado`);
        }
      } else if (mostrarAlerta || abrirAlTerminar) {
        mostrarToast('Error en Google Script: ' + (resJson?.error || 'Verificar permisos'));
      }
    } catch {
      if (mostrarAlerta || abrirAlTerminar) {
        mostrarToast('No se pudo conectar con Google Sheets');
      }
    } finally {
      setSincronizandoSheet(false);
    }
  };

  // ============================================================================
  // 8. PANTALLA DE LOGIN (ESTÉTICA DEPORTES UGI C.C.B.A.)
  // ============================================================================
  if (!logueado) {
    return (
      <div className="ugi-login-screen">
        <form onSubmit={ingresarApp} className="ugi-login-card" method="POST">
          <img
            src="/escudo-ccba.png"
            alt="Escudo Club Ciudad de Buenos Aires"
            className="ugi-login-shield"
          />
          <div>
            <span className="ugi-login-pill">Club Ciudad de Buenos Aires</span>
          </div>
          <h1>Unidad de Gestión Integral</h1>
          <p className="ugi-login-sub">Asistencia y listados · Colonia y COYFD</p>

          <div className="mb-3.5 text-left">
            <label htmlFor="login-area" className="ugi-label">
              1. Elegí tu área
            </label>
            <select
              id="login-area"
              name="area"
              className="ugi-select"
              value={areaLogin}
              onChange={(e) => {
                setAreaLogin(e.target.value);
                setLoginError('');
              }}
            >
              <option value="Colonia">Colonia (con almuerzo / comida)</option>
              <option value="COYFD">COYFD</option>
              <option value="TODOS">Dirección UGI (Colonia + COYFD)</option>
            </select>
          </div>

          <div className="mb-4 text-left">
            <label htmlFor="login-pass" className="ugi-label">
              2. Contraseña de Profe o Coordinación
            </label>
            <div className="relative flex items-center">
              <input
                id="login-pass"
                name="clave"
                type={mostrarPasswordLogin ? 'text' : 'password'}
                placeholder="Ingresá tu clave..."
                value={inputPinDeporte}
                onChange={(e) => {
                  setInputPinDeporte(e.target.value);
                  if (loginError) setLoginError('');
                }}
                autoComplete="current-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                required
                className="ugi-input pr-12"
              />
              <button
                type="button"
                onClick={() => setMostrarPasswordLogin((v) => !v)}
                aria-pressed={mostrarPasswordLogin}
                aria-label={mostrarPasswordLogin ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2.5 p-2 text-slate-500 hover:text-slate-800 rounded-lg"
              >
                {mostrarPasswordLogin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p
              id="login-error"
              role="status"
              aria-live="polite"
              className="text-red-600 text-xs font-bold mt-2 min-h-[1.1rem]"
            >
              {loginError}
            </p>
          </div>

          <button type="submit" disabled={validandoPin} className="ugi-btn">
            {validandoPin ? 'Verificando clave...' : 'Entrar al panel'}
          </button>
        </form>
      </div>
    );
  }

  // ============================================================================
  // 9. VARIABLES DERIVADAS DE LA SESIÓN ACTIVA
  // ============================================================================
  const esCoordOAdmin = rolSesion === 'coordinador' || rolSesion === 'admin';
  const esColoniaActiva = tieneOpcionComida(deporteSeleccionado);
  const categoriasDelDeporte = grupos.filter((g) => g.nombre === deporteSeleccionado);
  const grupoActual = grupos.find((g) => g.id === Number(grupoSeleccionado));

  const alumnosFiltrados = alumnos.filter((al) => {
    if (!busquedaAlumno.trim()) return true;
    const q = busquedaAlumno.trim().toLowerCase();
    return (
      al.apellido.toLowerCase().includes(q) ||
      al.nombre.toLowerCase().includes(q) ||
      `${al.apellido}, ${al.nombre}`.toLowerCase().includes(q)
    );
  });

  const totalPresentesHoy = alumnos.filter((al) => {
    const est = asistencias[al.id]?.estado || 'presente';
    return est === 'presente' || est === 'tarde';
  }).length;
  const totalAusentesHoy = alumnos.filter(
    (al) => (asistencias[al.id]?.estado || 'presente') === 'ausente'
  ).length;
  const totalAlmuerzosHoy = esColoniaActiva
    ? alumnos.filter((al) => {
        const a = asistencias[al.id];
        return a && a.estado !== 'ausente' && a.almuerzo;
      }).length
    : 0;
  const pctHoy =
    alumnos.length > 0 ? Math.round((totalPresentesHoy / alumnos.length) * 100) : 0;

  // Cantidad de alumnos detectados en vivo en el textarea de carga masiva
  const cantidadDetectadaEnTexto = padronTextoMasivo
    .split(/\r?\n/)
    .map(parsearLineaAlumno)
    .filter(Boolean).length;

  const etiquetaRol =
    rolSesion === 'admin'
      ? 'Dirección UGI'
      : rolSesion === 'coordinador'
      ? 'Coordinación'
      : 'Profe';

  const urlSheetActual = sheetUrlsPorDeporte[deporteSeleccionado];

  return (
    <div className="min-h-screen flex flex-col">
      {/* CABECERA PRINCIPAL CON ESCUDO C.C.B.A. */}
      <header className="ugi-header">
        <div className="ugi-brand">
          <img src="/escudo-ccba.png" alt="C.C.B.A." />
          <div>
            <h1>Unidad de Gestión Integral</h1>
            <small>
              {deporteSeleccionado} · {etiquetaRol}
              {esColoniaActiva ? ' · 🍴 Con Comida' : ' · Sin Comida'}
            </small>
          </div>
        </div>
        <button type="button" onClick={cerrarSesion} className="ugi-btn-salir">
          Cambiar / Salir
        </button>
      </header>

      {/* BARRA DE ESTADO Y ACCESO DIRECTO AL GOOGLE SHEET */}
      <div className="ugi-estado flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={
              estadoConexion === 'ok' ? 'text-emerald-600 font-extrabold' : 'text-amber-600 font-extrabold'
            }
          >
            ●
          </span>
          <span>
            {estadoConexion === 'ok'
              ? `Conectado en vivo · ${deporteSeleccionado}`
              : 'Verificando conexión con la base de datos...'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {urlSheetActual ? (
            <>
              <a
                href={urlSheetActual}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100"
              >
                <ExternalLink size={12} /> Abrir Sheet {deporteSeleccionado}
              </a>
              <button
                type="button"
                onClick={() => sincronizarGoogleSheetDeporte(deporteSeleccionado, true, false)}
                disabled={sincronizandoSheet}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-1 rounded-lg hover:bg-slate-200"
              >
                <RefreshCw size={12} className={sincronizandoSheet ? 'animate-spin' : ''} />
                {sincronizandoSheet ? 'Sincronizando...' : 'Actualizar Sheet'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => sincronizarGoogleSheetDeporte(deporteSeleccionado, false, true)}
              disabled={sincronizandoSheet}
              className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100"
            >
              <ExternalLink size={12} />
              {sincronizandoSheet
                ? 'Generando Sheet...'
                : `Crear / Abrir Sheet ${deporteSeleccionado}`}
            </button>
          )}
        </div>
      </div>

      {/* CONTENEDOR CENTRAL */}
      <main className="ugi-container">
        {/* PESTAÑAS DE NAVEGACIÓN ESTILO DEPORTES UGI */}
        <div
          className="ugi-tabs"
          role="tablist"
          style={{
            gridTemplateColumns: esCoordOAdmin ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tabActiva === 'asistencia'}
            onClick={() => setTabActiva('asistencia')}
            className="ugi-tab"
          >
            <ClipboardList size={15} />
            <span>Asistencia</span>
          </button>

          {esCoordOAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'analisis'}
              onClick={() => setTabActiva('analisis')}
              className="ugi-tab"
            >
              <BarChart3 size={15} />
              <span>Análisis</span>
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={tabActiva === 'padron'}
            onClick={() => setTabActiva('padron')}
            className="ugi-tab"
          >
            <Upload size={15} />
            <span>Listados / Padrón</span>
          </button>

          {esCoordOAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'config'}
              onClick={() => setTabActiva('config')}
              className="ugi-tab"
            >
              <Key size={15} />
              <span>Claves y Sheets</span>
            </button>
          )}
        </div>

        {/* TARJETA DE FILTROS EN CASCADA (ÁREA, CATEGORÍA/GRUPO Y FECHA) */}
        {tabActiva !== 'config' && (
          <div className="ugi-card">
            {/* Si entró como Dirección UGI puede alternar entre Colonia y COYFD */}
            {rolSesion === 'admin' && (
              <div className="mb-3">
                <label htmlFor="sel-area-activa" className="ugi-label">
                  Área activa
                </label>
                <select
                  id="sel-area-activa"
                  className="ugi-select"
                  value={deporteSeleccionado}
                  onChange={(e) => setDeporteSeleccionado(e.target.value)}
                >
                  {DEPORTES_OFICIALES.map((d) => (
                    <option key={d.nombre} value={d.nombre}>
                      {d.nombre} {d.tieneComida ? '(Con opción de comida)' : '(Sin comida)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="sel-grupo" className="ugi-label" style={{ marginBottom: 0 }}>
                    Grupo / Categoría ({deporteSeleccionado})
                  </label>
                  <div className="flex items-center gap-2">
                    {grupoSeleccionado && (
                      <button
                        type="button"
                        onClick={() => {
                          setModoCategoria('editar');
                          setInputCategoria(grupoActual?.categoria || '');
                        }}
                        className="text-xs font-bold text-sky-700 hover:underline inline-flex items-center gap-1"
                      >
                        <Edit2 size={12} /> Renombrar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setModoCategoria('crear');
                        setInputCategoria('');
                      }}
                      className="text-xs font-extrabold text-blue-900 bg-sky-100 border border-sky-200 px-2 py-0.5 rounded-md hover:bg-sky-200 inline-flex items-center gap-1"
                    >
                      <Plus size={12} /> Nuevo grupo
                    </button>
                  </div>
                </div>

                {categoriasDelDeporte.length > 0 ? (
                  <select
                    id="sel-grupo"
                    className="ugi-select"
                    value={grupoSeleccionado || ''}
                    onChange={(e) => setGrupoSeleccionado(Number(e.target.value))}
                  >
                    {categoriasDelDeporte.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.categoria}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Sin grupos en <b>{deporteSeleccionado}</b>. Tocá <b>+ Nuevo grupo</b> o subí un
                    listado en la pestaña <b>Listados / Padrón</b>.
                  </div>
                )}
              </div>

              {tabActiva === 'asistencia' && (
                <div>
                  <label htmlFor="input-fecha-sesion" className="ugi-label">
                    Fecha de la sesión
                  </label>
                  <input
                    id="input-fecha-sesion"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="ugi-input"
                  />
                </div>
              )}

              {tabActiva === 'padron' && (
                <div className="flex flex-col justify-end">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-extrabold text-slate-500 uppercase">
                        Alumnos en {grupoActual?.categoria || 'este grupo'}
                      </div>
                      <div className="text-xl font-extrabold text-slate-900">
                        {alumnos.length} inscriptos
                      </div>
                    </div>
                    {alumnos.length > 0 && (
                      <button
                        type="button"
                        onClick={vaciarGrupoActual}
                        className="ugi-quitar"
                        title="Quitar todos los alumnos de este grupo"
                      >
                        Vaciar grupo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Editor inline para crear o renombrar grupo */}
            {modoCategoria !== 'ninguno' && (
              <div className="mt-3 p-3 bg-sky-50 border border-sky-200 rounded-xl flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <input
                  type="text"
                  placeholder={
                    deporteSeleccionado === 'Colonia'
                      ? 'Ej: Grupo 6 años, Turno Mañana, Grupo Roja...'
                      : 'Ej: COYFD Mañana, Grupo A, Formativa...'
                  }
                  value={inputCategoria}
                  onChange={(e) => setInputCategoria(e.target.value)}
                  className="ugi-input flex-1 bg-white"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={guardarCategoria}
                    className="ugi-btn"
                    style={{ width: 'auto', minHeight: '44px' }}
                  >
                    Guardar grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoCategoria('ninguno')}
                    className="ugi-btn-sec"
                    style={{ minHeight: '44px' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            PESTAÑA 1: ASISTENCIA (P / A / T + COMIDA SIEMPRE EN COLONIA)
           ===================================================================== */}
        {tabActiva === 'asistencia' && (
          <section aria-label="Toma de asistencia">
            {/* KPIs rápidos del día */}
            {grupoSeleccionado && alumnos.length > 0 && (
              <div
                className="grid gap-2.5 mb-3.5"
                style={{
                  gridTemplateColumns: esColoniaActiva
                    ? 'repeat(3, 1fr)'
                    : 'repeat(2, 1fr)',
                }}
              >
                <div className="ugi-kpi kpi-ok">
                  <span>Presentismo hoy</span>
                  <b>{pctHoy}%</b>
                  <span>
                    {totalPresentesHoy} de {alumnos.length} ({totalAusentesHoy} aus.)
                  </span>
                </div>

                {esColoniaActiva ? (
                  <div className="ugi-kpi kpi-warn">
                    <span>🍴 Comida hoy</span>
                    <b>{totalAlmuerzosHoy}</b>
                    <span>almuerzan en Colonia</span>
                  </div>
                ) : (
                  <div className="ugi-kpi">
                    <span>Grupo activo</span>
                    <b className="truncate px-1 text-base sm:text-xl">
                      {grupoActual?.categoria || '-'}
                    </b>
                    <span>COYFD (sin comida)</span>
                  </div>
                )}

                <div className="ugi-kpi">
                  <span>Inscriptos</span>
                  <b>{alumnos.length}</b>
                  <span>en {grupoActual?.categoria}</span>
                </div>
              </div>
            )}

            <div className="ugi-card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3>Lista de asistencia · {grupoActual?.categoria || deporteSeleccionado}</h3>
                  <p className="ugi-hint" style={{ marginBottom: 0 }}>
                    P = Presente · A = Ausente · T = Tarde
                    {esColoniaActiva ? ' · 🍴 = Se queda a comer en Colonia' : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={marcarTodosPresentes}
                    disabled={alumnos.length === 0}
                    className="ugi-btn-sec"
                  >
                    Todos presentes (P)
                  </button>
                  {esColoniaActiva && alumnos.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        marcarTodosComida(totalAlmuerzosHoy < totalPresentesHoy)
                      }
                      className="ugi-btn-sec"
                      style={{
                        background: '#ffedd5',
                        color: '#9a3412',
                        borderColor: '#fed7aa',
                      }}
                    >
                      <Utensils size={14} />
                      {totalAlmuerzosHoy < totalPresentesHoy
                        ? 'Todos con comida'
                        : 'Quitar comidas'}
                    </button>
                  )}
                </div>
              </div>

              {/* Buscador rápido cuando el grupo tiene varios alumnos */}
              {alumnos.length > 5 && (
                <div className="relative mb-3">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="search"
                    placeholder="Buscar alumno por apellido o nombre..."
                    value={busquedaAlumno}
                    onChange={(e) => setBusquedaAlumno(e.target.value)}
                    className="ugi-input pl-10"
                    style={{ minHeight: '42px', fontSize: '0.9rem' }}
                  />
                </div>
              )}

              {/* Listado de alumnos */}
              {!grupoSeleccionado || alumnos.length === 0 ? (
                <div className="text-center py-6 px-3">
                  <p className="text-sm text-slate-500 mb-3">
                    No hay alumnos cargados en{' '}
                    <b>{grupoActual?.categoria || deporteSeleccionado}</b>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTabActiva('padron')}
                    className="ugi-btn-sec"
                  >
                    <Upload size={15} /> Ir a subir o pegar el listado del grupo
                  </button>
                </div>
              ) : (
                <div>
                  {alumnosFiltrados.map((al) => {
                    const actual = asistencias[al.id] || {
                      estado: 'presente',
                      almuerzo: false,
                    };

                    return (
                      <div key={al.id} className="ugi-asist-row">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-bold text-slate-900 text-[0.94rem] truncate">
                            {al.apellido}, {al.nombre}
                          </div>
                          {esColoniaActiva && actual.almuerzo && actual.estado !== 'ausente' && (
                            <span className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full mt-0.5">
                              🍴 Con comida
                            </span>
                          )}
                        </div>

                        <div
                          className="ugi-pat"
                          role="group"
                          aria-label={`Asistencia de ${al.apellido}, ${al.nombre}`}
                        >
                          {/* En Colonia SIEMPRE se muestra el botón de Comida */}
                          {esColoniaActiva && (
                            <button
                              type="button"
                              onClick={() => handleAlmuerzo(al.id)}
                              aria-pressed={actual.almuerzo && actual.estado !== 'ausente'}
                              title={
                                actual.almuerzo
                                  ? 'Come en la Colonia (tocar para quitar)'
                                  : 'Sin comida (tocar para marcar comida)'
                              }
                              className="ugi-comida-btn"
                            >
                              <Utensils size={14} />
                              <span className="hidden sm:inline">
                                {actual.almuerzo && actual.estado !== 'ausente'
                                  ? 'Comida'
                                  : 'Sin comida'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            data-e="presente"
                            aria-pressed={actual.estado === 'presente'}
                            onClick={() => handleEstado(al.id, 'presente')}
                            title="Presente"
                            className="ugi-pat-btn"
                          >
                            P
                          </button>
                          <button
                            type="button"
                            data-e="ausente"
                            aria-pressed={actual.estado === 'ausente'}
                            onClick={() => handleEstado(al.id, 'ausente')}
                            title="Ausente"
                            className="ugi-pat-btn"
                          >
                            A
                          </button>
                          <button
                            type="button"
                            data-e="tarde"
                            aria-pressed={actual.estado === 'tarde'}
                            onClick={() => handleEstado(al.id, 'tarde')}
                            title="Tarde"
                            className="ugi-pat-btn"
                          >
                            T
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {alumnos.length > 0 && (
                <button
                  type="button"
                  onClick={guardarAsistencias}
                  disabled={cargando}
                  className="ugi-btn ok mt-4"
                >
                  <Check size={18} />
                  {cargando
                    ? 'Guardando y actualizando Google Sheet...'
                    : `Guardar asistencia de ${grupoActual?.categoria || deporteSeleccionado}`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* =====================================================================
            PESTAÑA 2: SUBIDA ÁGIL DE LISTADOS Y PADRÓN (PROFE Y COORDINACIÓN)
           ===================================================================== */}
        {tabActiva === 'padron' && (
          <section aria-label="Carga ágil de listados y padrón">
            {/* OPCIÓN 1: SUBIR ARCHIVO EXCEL (.XLSX / .XLS) O CSV */}
            <div className="ugi-card">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="flex items-center gap-2">
                    <FileSpreadsheet size={18} className="text-emerald-700" />
                    1. Subir listado desde archivo Excel (.xlsx) o CSV
                  </h3>
                  <p className="ugi-hint" style={{ marginBottom: 0 }}>
                    Seleccioná tu planilla de Excel o CSV. Detecta automáticamente las columnas{' '}
                    <b>Apellido</b>, <b>Nombre</b> y <b>Grupo</b> (o múltiples pestañas).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={descargarPlantillaExcel}
                  className="ugi-btn-sec"
                >
                  <Download size={14} /> Bajar plantilla Excel
                </button>
              </div>

              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={manejarArchivoExcel}
                  className="sr-only"
                  id="input-archivo-excel"
                />
                <label
                  htmlFor="input-archivo-excel"
                  className="cursor-pointer border-2 border-dashed border-sky-300 bg-sky-50/70 hover:bg-sky-100/70 transition-colors rounded-2xl p-5 flex flex-col items-center justify-center text-center"
                >
                  <Upload size={26} className="text-blue-800 mb-1.5" />
                  <span className="text-sm font-extrabold text-slate-800">
                    {archivoNombre
                      ? `Archivo cargado: ${archivoNombre}`
                      : 'Tocá acá para elegir tu archivo Excel (.xlsx, .xls) o CSV'}
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5">
                    Podés subir un grupo solo o toda la Colonia / COYFD junta en un mismo archivo
                  </span>
                </label>
              </div>

              {/* Vista previa e importación en 1 clic cuando se selecciona un Excel */}
              {alumnosExcelPreview.length > 0 && (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="text-sm font-extrabold text-emerald-950">
                      ✓ {alumnosExcelPreview.length} alumnos detectados en el archivo
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAlumnosExcelPreview([]);
                        setArchivoNombre('');
                      }}
                      className="text-xs font-bold text-slate-600 hover:underline"
                    >
                      Cancelar archivo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label htmlFor="modo-import-excel" className="ugi-label">
                        ¿Cómo querés importarlos?
                      </label>
                      <select
                        id="modo-import-excel"
                        className="ugi-select bg-white"
                        value={modoImportExcel}
                        onChange={(e) =>
                          setModoImportExcel(
                            e.target.value as 'grupo_actual' | 'por_columna_o_hoja'
                          )
                        }
                      >
                        <option value="grupo_actual">
                          Cargar todos en un grupo específico
                        </option>
                        <option value="por_columna_o_hoja">
                          Usar la columna &quot;Grupo&quot; o el nombre de cada pestaña del Excel
                        </option>
                      </select>
                    </div>

                    {modoImportExcel === 'grupo_actual' && (
                      <div>
                        <label htmlFor="grupo-destino-excel" className="ugi-label">
                          Grupo destino en {deporteSeleccionado}
                        </label>
                        <input
                          id="grupo-destino-excel"
                          type="text"
                          list="dl-grupos-area"
                          value={grupoDestinoExcel}
                          onChange={(e) => setGrupoDestinoExcel(e.target.value)}
                          placeholder="Ej: Grupo 8 años"
                          className="ugi-input bg-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="max-h-40 overflow-y-auto bg-white border border-emerald-200 rounded-lg p-2.5 mb-3 text-xs">
                    {alumnosExcelPreview.slice(0, 15).map((item, idx) => (
                      <div
                        key={idx}
                        className="py-1 border-b border-slate-100 last:border-none flex justify-between gap-2"
                      >
                        <span className="font-bold text-slate-800">
                          {item.apellido}, {item.nombre}
                        </span>
                        <span className="text-slate-500 font-semibold">
                          {modoImportExcel === 'grupo_actual'
                            ? grupoDestinoExcel || 'Sin grupo'
                            : item.grupo}
                        </span>
                      </div>
                    ))}
                    {alumnosExcelPreview.length > 15 && (
                      <div className="pt-1.5 text-center text-slate-500 font-semibold">
                        ... y {alumnosExcelPreview.length - 15} alumnos más
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={confirmarImportacionExcel}
                    disabled={cargandoMasivo}
                    className="ugi-btn ok"
                  >
                    {cargandoMasivo
                      ? 'Importando listado...'
                      : `Confirmar y subir ${alumnosExcelPreview.length} alumnos a ${deporteSeleccionado}`}
                  </button>
                </div>
              )}
            </div>

            {/* OPCIÓN 2: PEGAR LISTADO RÁPIDO DESDE WHATSAPP O EXCEL (IGUAL A APP DEPORTES) */}
            <form onSubmit={cargarListadoMasivoTexto} className="ugi-card">
              <h3>2. Pegar listado rápido (WhatsApp / Excel / Word)</h3>
              <p className="ugi-hint">
                Pegá la lista con un alumno por renglón (ej: <b>Gómez, Juan</b> o{' '}
                <b>Juan Gómez</b>). Si el grupo no existe en <b>{deporteSeleccionado}</b>, se crea
                automáticamente.
              </p>

              <datalist id="dl-grupos-area">
                {categoriasDelDeporte.map((c) => (
                  <option key={c.id} value={c.categoria} />
                ))}
              </datalist>

              <div className="mb-3">
                <label htmlFor="padron-cat-input" className="ugi-label">
                  Grupo / Categoría de {deporteSeleccionado}
                </label>
                <input
                  id="padron-cat-input"
                  type="text"
                  list="dl-grupos-area"
                  required
                  value={padronCategoriaInput}
                  onChange={(e) => setPadronCategoriaInput(e.target.value)}
                  placeholder={
                    deporteSeleccionado === 'Colonia'
                      ? 'Ej: Grupo 6 años, Turno Mañana...'
                      : 'Ej: COYFD Turno Tarde, Grupo A...'
                  }
                  className="ugi-input"
                />
              </div>

              <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="padron-lista-textarea" className="ugi-label" style={{ marginBottom: 0 }}>
                    Alumnos (uno por línea)
                  </label>
                  {cantidadDetectadaEnTexto > 0 && (
                    <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      {cantidadDetectadaEnTexto} alumnos detectados
                    </span>
                  )}
                </div>
                <textarea
                  id="padron-lista-textarea"
                  required
                  value={padronTextoMasivo}
                  onChange={(e) => setPadronTextoMasivo(e.target.value)}
                  placeholder={'Gómez, Juan\nPérez, Mateo\nRodríguez, Lucía'}
                  className="ugi-textarea"
                />
              </div>

              <button type="submit" disabled={cargandoMasivo} className="ugi-btn">
                {cargandoMasivo
                  ? 'Cargando alumnos...'
                  : `Cargar listado en ${padronCategoriaInput.trim() || 'el grupo'}`}
              </button>
            </form>

            {/* OPCIÓN 3: SUMAR UN ALUMNO INDIVIDUAL Y ADMINISTRAR EL PLANTEL ACTUAL */}
            {grupoSeleccionado && (
              <div className="ugi-card">
                <h3>
                  3. Plantel actual de {grupoActual?.categoria} ({alumnos.length})
                </h3>
                <p className="ugi-hint">
                  También podés sumar un alumno individualmente o dar de baja del listado.
                </p>

                <form
                  onSubmit={agregarAlumnoIndividual}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4"
                >
                  <input
                    type="text"
                    placeholder="Apellido"
                    value={nuevoApellido}
                    onChange={(e) => setNuevoApellido(e.target.value)}
                    required
                    className="ugi-input"
                  />
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    required
                    className="ugi-input"
                  />
                  <button type="submit" className="ugi-btn">
                    <UserPlus size={16} /> Sumar al grupo
                  </button>
                </form>

                {alumnos.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">
                    Este grupo aún no tiene alumnos cargados.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                    {alumnos.map((al) => (
                      <div
                        key={al.id}
                        className="flex items-center justify-between py-2.5 gap-2 text-sm font-semibold"
                      >
                        <span className="text-slate-800">
                          {al.apellido}, {al.nombre}
                        </span>
                        <button
                          type="button"
                          onClick={() => eliminarAlumno(al.id, `${al.apellido}, ${al.nombre}`)}
                          className="ugi-quitar inline-flex items-center gap-1"
                        >
                          <Trash2 size={13} /> Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* =====================================================================
            PESTAÑA 3: ANÁLISIS Y SEGUIMIENTO (COORDINACIÓN Y DIRECCIÓN UGI)
           ===================================================================== */}
        {tabActiva === 'analisis' && esCoordOAdmin && (
          <section aria-label="Análisis de asistencia y seguimiento">
            {(() => {
              const viendoAmbasAreas =
                rolSesion === 'admin' && filtroAreaAnalisis === 'TODOS';
              const areaFiltro = viendoAmbasAreas ? 'TODOS' : deporteSeleccionado;
              const mostrarComidaAnalisis =
                areaFiltro === 'Colonia' || areaFiltro === 'TODOS';

              const gruposAnalisis = grupos.filter((g) =>
                areaFiltro === 'TODOS' ? true : g.nombre === areaFiltro
              );

              const registrosArea = registrosAdmin.filter((r: any) =>
                areaFiltro === 'TODOS'
                  ? true
                  : r.alumnos?.grupos?.nombre === areaFiltro
              );

              const registrosFiltrados = registrosArea.filter((r: any) =>
                filtroCategoriaCoord === 'TODAS'
                  ? true
                  : r.alumnos?.grupos?.categoria === filtroCategoriaCoord
              );

              const presentesTot = registrosFiltrados.filter(
                (r) => r.estado === 'presente' || r.estado === 'tarde'
              ).length;
              const ausentesTot = registrosFiltrados.filter(
                (r) => r.estado === 'ausente'
              ).length;
              const pctAsist =
                registrosFiltrados.length > 0
                  ? Math.round((presentesTot / registrosFiltrados.length) * 100)
                  : 0;
              const almuerzosTot = registrosFiltrados.filter(
                (r) => r.alumnos?.grupos?.nombre === 'Colonia' && r.almuerzo
              ).length;

              // Construir matriz individual por alumno del área/grupo seleccionado
              const idsGruposValidos = new Set(
                gruposAnalisis
                  .filter((g) =>
                    filtroCategoriaCoord === 'TODAS'
                      ? true
                      : g.categoria === filtroCategoriaCoord
                  )
                  .map((g) => g.id)
              );
              const mapaGrupo = new Map(grupos.map((g) => [g.id, g]));

              const matrizAlumnos = alumnosAreaCompleta
                .filter((al) => idsGruposValidos.has(al.grupo_id))
                .map((al) => {
                  const gr = mapaGrupo.get(al.grupo_id);
                  const regs = registrosFiltrados.filter((r) => r.alumno_id === al.id);
                  const pres = regs.filter(
                    (r) => r.estado === 'presente' || r.estado === 'tarde'
                  ).length;
                  const aus = regs.filter((r) => r.estado === 'ausente').length;
                  const alm =
                    gr?.nombre === 'Colonia'
                      ? regs.filter((r) => r.almuerzo).length
                      : 0;
                  const pct =
                    regs.length > 0 ? Math.round((pres / regs.length) * 100) : null;
                  const alerta = pct !== null && pct < 70;
                  return {
                    id: al.id,
                    alumno: `${al.apellido}, ${al.nombre}`,
                    area: gr?.nombre || '',
                    categoria: gr?.categoria || '',
                    presentes: pres,
                    ausentes: aus,
                    almuerzos: alm,
                    total: regs.length,
                    pct,
                    alerta,
                  };
                })
                .sort((a, b) => (a.alerta === b.alerta ? 0 : a.alerta ? -1 : 1));

              const totalAlertas = matrizAlumnos.filter((m) => m.alerta).length;

              const exportarExcelAnalisis = () => {
                const filas = matrizAlumnos.map((m) => {
                  const base: Record<string, any> = {
                    Área: m.area,
                    Grupo: m.categoria,
                    Alumno: m.alumno,
                    '% Asistencia': m.pct !== null ? `${m.pct}%` : '-',
                    Presentes: m.presentes,
                    Ausentes: m.ausentes,
                    'Clases Registradas': m.total,
                  };
                  if (mostrarComidaAnalisis) {
                    base['Almuerzos (Colonia)'] =
                      m.area === 'Colonia' ? m.almuerzos : '-';
                  }
                  base.Estado =
                    m.pct === null
                      ? 'Sin registros'
                      : m.alerta
                      ? 'Seguimiento (<70%)'
                      : 'Óptimo';
                  return base;
                });
                const ws = XLSX.utils.json_to_sheet(filas);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Matriz_Asistencia');
                XLSX.writeFile(
                  wb,
                  `UGI_Asistencia_${areaFiltro}_${fechaDesde}_a_${fechaHasta}.xlsx`
                );
              };

              return (
                <>
                  {/* Filtros de período y grupo */}
                  <div className="ugi-card">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label htmlFor="f-desde" className="ugi-label">
                          Desde
                        </label>
                        <input
                          id="f-desde"
                          type="date"
                          value={fechaDesde}
                          onChange={(e) => setFechaDesde(e.target.value)}
                          className="ugi-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="f-hasta" className="ugi-label">
                          Hasta
                        </label>
                        <input
                          id="f-hasta"
                          type="date"
                          value={fechaHasta}
                          onChange={(e) => setFechaHasta(e.target.value)}
                          className="ugi-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="f-cat-coord" className="ugi-label">
                          Grupo / Categoría
                        </label>
                        <select
                          id="f-cat-coord"
                          value={filtroCategoriaCoord}
                          onChange={(e) => setFiltroCategoriaCoord(e.target.value)}
                          className="ugi-select"
                        >
                          <option value="TODAS">
                            Todos los grupos ({gruposAnalisis.length})
                          </option>
                          {gruposAnalisis.map((c) => (
                            <option key={c.id} value={c.categoria}>
                              {viendoAmbasAreas ? `${c.nombre} · ${c.categoria}` : c.categoria}
                            </option>
                          ))}
                        </select>
                      </div>

                      {rolSesion === 'admin' ? (
                        <div>
                          <label htmlFor="f-area-admin" className="ugi-label">
                            Vista Dirección UGI
                          </label>
                          <select
                            id="f-area-admin"
                            value={filtroAreaAnalisis}
                            onChange={(e) => {
                              setFiltroAreaAnalisis(e.target.value);
                              setFiltroCategoriaCoord('TODAS');
                            }}
                            className="ugi-select"
                          >
                            <option value="ACTUAL">Solo {deporteSeleccionado}</option>
                            <option value="TODOS">Colonia + COYFD juntos</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={exportarExcelAnalisis}
                            className="ugi-btn-sec w-full"
                            style={{ minHeight: '48px' }}
                          >
                            <Download size={15} /> Bajar Excel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tarjetas de KPIs estilo Deportes UGI */}
                  <div
                    className="grid gap-2.5 mb-3.5"
                    style={{
                      gridTemplateColumns: mostrarComidaAnalisis
                        ? 'repeat(4, 1fr)'
                        : 'repeat(3, 1fr)',
                    }}
                  >
                    <div className="ugi-kpi kpi-ok">
                      <span>Asistencia</span>
                      <b>{pctAsist}%</b>
                      <span>{presentesTot} pres.</span>
                    </div>

                    <div className="ugi-kpi kpi-bad">
                      <span>Ausentes</span>
                      <b>{ausentesTot}</b>
                      <span>en el período</span>
                    </div>

                    {mostrarComidaAnalisis && (
                      <div className="ugi-kpi kpi-warn">
                        <span>🍴 Almuerzos</span>
                        <b>{almuerzosTot}</b>
                        <span>en Colonia</span>
                      </div>
                    )}

                    <div className="ugi-kpi">
                      <span>Alertas (&lt;70%)</span>
                      <b>{totalAlertas}</b>
                      <span>seguimiento</span>
                    </div>
                  </div>

                  {/* Rendimiento / Porcentaje por cada Grupo con barras estilo Deportes */}
                  {gruposAnalisis.length > 0 && (
                    <div className="ugi-card">
                      <h3>Porcentaje de asistencia por grupo</h3>
                      <p className="ugi-hint">
                        Tocá un grupo para filtrar la matriz individual de abajo.
                      </p>
                      <div className="space-y-3">
                        {gruposAnalisis.map((cat) => {
                          const regsCat = registrosArea.filter(
                            (r: any) => r.alumnos?.grupos?.id === cat.id
                          );
                          const presCat = regsCat.filter(
                            (r: any) => r.estado === 'presente' || r.estado === 'tarde'
                          ).length;
                          const pctCat =
                            regsCat.length > 0
                              ? Math.round((presCat / regsCat.length) * 100)
                              : 0;
                          const almCat =
                            cat.nombre === 'Colonia'
                              ? regsCat.filter((r: any) => r.almuerzo).length
                              : 0;
                          const activo = filtroCategoriaCoord === cat.categoria;
                          const colorBarra =
                            pctCat >= 80
                              ? 'var(--ok)'
                              : pctCat >= 70
                              ? 'var(--sky)'
                              : 'var(--bad)';

                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() =>
                                setFiltroCategoriaCoord(activo ? 'TODAS' : cat.categoria)
                              }
                              className={`w-full text-left p-3 rounded-xl border transition-all ${
                                activo
                                  ? 'bg-sky-50 border-sky-400 shadow-xs'
                                  : 'bg-slate-50/70 border-slate-200 hover:bg-white'
                              }`}
                            >
                              <div className="flex justify-between items-center text-sm font-bold mb-1.5 gap-2">
                                <span className="text-slate-900">
                                  {viendoAmbasAreas
                                    ? `${cat.nombre} · ${cat.categoria}`
                                    : cat.categoria}
                                </span>
                                <span className="text-xs font-extrabold text-slate-700">
                                  {regsCat.length > 0
                                    ? `${pctCat}% (${presCat}/${regsCat.length})`
                                    : 'Sin registros'}
                                  {cat.nombre === 'Colonia' && regsCat.length > 0
                                    ? ` · 🍴 ${almCat}`
                                    : ''}
                                </span>
                              </div>
                              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  style={{
                                    width: `${pctCat}%`,
                                    background: colorBarra,
                                  }}
                                  className="h-full rounded-full transition-all"
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Matriz Individual de Alumnos (con alertas < 70%) */}
                  <div className="ugi-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <h3>Matriz individual de asistencia</h3>
                        <p className="ugi-hint" style={{ marginBottom: 0 }}>
                          Se marca en seguimiento si el presentismo baja del 70%.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={exportarExcelAnalisis}
                        className="ugi-btn-sec"
                      >
                        <Download size={14} /> Bajar Excel (.xlsx)
                      </button>
                    </div>

                    <div
                      tabIndex={0}
                      role="region"
                      aria-label="Matriz individual de asistencia"
                      className="ugi-table-wrapper"
                    >
                      <table className="ugi-table">
                        <thead>
                          <tr>
                            <th>Alumno</th>
                            <th>Grupo</th>
                            <th>Asist.</th>
                            <th>Pres. / Total</th>
                            {mostrarComidaAnalisis && <th>🍴 Comidas</th>}
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cargandoAdmin ? (
                            <tr>
                              <td
                                colSpan={mostrarComidaAnalisis ? 6 : 5}
                                className="text-center py-6 text-slate-500"
                              >
                                Cargando datos...
                              </td>
                            </tr>
                          ) : matrizAlumnos.length === 0 ? (
                            <tr>
                              <td
                                colSpan={mostrarComidaAnalisis ? 6 : 5}
                                className="text-center py-6 text-slate-500"
                              >
                                Sin alumnos en este filtro.
                              </td>
                            </tr>
                          ) : (
                            matrizAlumnos.map((m) => (
                              <tr key={m.id} className="hover:bg-slate-50">
                                <td className="font-bold text-slate-900">{m.alumno}</td>
                                <td className="text-slate-600 text-xs font-semibold">
                                  {viendoAmbasAreas
                                    ? `${m.area} · ${m.categoria}`
                                    : m.categoria}
                                </td>
                                <td className="font-extrabold">
                                  {m.pct !== null ? `${m.pct}%` : '-'}
                                </td>
                                <td className="text-slate-600">
                                  {m.presentes} / {m.total}
                                </td>
                                {mostrarComidaAnalisis && (
                                  <td className="text-slate-700 font-semibold">
                                    {m.area === 'Colonia' ? `🍴 ${m.almuerzos}` : '—'}
                                  </td>
                                )}
                                <td>
                                  {m.pct === null ? (
                                    <span className="ugi-pill a">– Sin datos</span>
                                  ) : m.alerta ? (
                                    <span className="ugi-pill r">⚠ Seguimiento</span>
                                  ) : (
                                    <span className="ugi-pill v">✓ Óptimo</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {/* =====================================================================
            PESTAÑA 4: CLAVES Y GOOGLE SHEETS (COORDINACIÓN Y DIRECCIÓN UGI)
           ===================================================================== */}
        {tabActiva === 'config' && esCoordOAdmin && (
          <section aria-label="Configuración de contraseñas y Google Sheets">
            {/* Contraseñas de Profe y Coordinación para Colonia y COYFD */}
            <div className="ugi-card">
              <h3>Contraseñas de acceso · Colonia y COYFD</h3>
              <p className="ugi-hint">
                Cada área tiene su contraseña de <b>Profe</b> y su contraseña de{' '}
                <b>Coordinación</b>. Podés modificarlas cuando quieras.
              </p>

              <div
                tabIndex={0}
                role="region"
                aria-label="Tabla de contraseñas de Colonia y COYFD"
                className="ugi-table-wrapper"
              >
                <table className="ugi-table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th>Comida</th>
                      <th>Clave Profe</th>
                      <th>Clave Coordinación</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEPORTES_OFICIALES.filter((d) =>
                      rolSesion === 'admin' ? true : d.nombre === deporteSeleccionado
                    ).map((d) => {
                      const info = pinsDeportes[d.nombre] || {
                        pin: d.pinDefault,
                        pinCoord: d.pinCoordDefault,
                      };
                      const editando = deporteEditandoPin === d.nombre;

                      return (
                        <tr key={d.nombre}>
                          <td className="font-extrabold text-slate-900">{d.nombre}</td>
                          <td>
                            {d.tieneComida ? (
                              <span className="ugi-pill v">🍴 Siempre activa</span>
                            ) : (
                              <span className="ugi-pill a">Sin comida</span>
                            )}
                          </td>
                          <td>
                            {editando ? (
                              <input
                                type="text"
                                value={inputEditPinProfe}
                                onChange={(e) => setInputEditPinProfe(e.target.value)}
                                className="ugi-input"
                                style={{ minHeight: '38px', maxWidth: '120px' }}
                              />
                            ) : (
                              <code className="bg-sky-50 text-blue-900 border border-sky-200 px-2.5 py-1 rounded-lg font-extrabold">
                                {info.pin}
                              </code>
                            )}
                          </td>
                          <td>
                            {editando ? (
                              <input
                                type="text"
                                value={inputEditPinCoord}
                                onChange={(e) => setInputEditPinCoord(e.target.value)}
                                className="ugi-input"
                                style={{ minHeight: '38px', maxWidth: '120px' }}
                              />
                            ) : (
                              <code className="bg-indigo-50 text-indigo-900 border border-indigo-200 px-2.5 py-1 rounded-lg font-extrabold">
                                {info.pinCoord}
                              </code>
                            )}
                          </td>
                          <td>
                            {editando ? (
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => guardarPinsAdmin(d.nombre)}
                                  className="ugi-btn ok"
                                  style={{
                                    width: 'auto',
                                    minHeight: '36px',
                                    padding: '0 12px',
                                    fontSize: '0.78rem',
                                  }}
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeporteEditandoPin(null)}
                                  className="ugi-btn-sec"
                                  style={{ minHeight: '36px', padding: '0 10px' }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeporteEditandoPin(d.nombre);
                                  setInputEditPinProfe(info.pin);
                                  setInputEditPinCoord(info.pinCoord);
                                }}
                                className="ugi-btn-sec"
                                style={{ minHeight: '36px' }}
                              >
                                <Edit2 size={13} /> Cambiar claves
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Planillas Google Sheets en Vivo */}
            <div className="ugi-card">
              <h3>Planillas Google Sheets en vivo (Colonia y COYFD)</h3>
              <p className="ugi-hint">
                Se actualizan automáticamente cada vez que un profe guarda la asistencia. En{' '}
                <b>Colonia</b> incluye la columna de Almuerzos y en <b>COYFD</b> solo presentismo.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {DEPORTES_OFICIALES.map((d) => {
                  const url = sheetUrlsPorDeporte[d.nombre];
                  return (
                    <div
                      key={d.nombre}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
                          <span>📊 Planilla {d.nombre}</span>
                          <span className="text-[11px] font-bold text-slate-500">
                            {d.tieneComida ? '🍴 Con almuerzos' : 'Sin comida'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {url
                            ? 'Planilla creada y sincronizada en vivo.'
                            : 'Tocá el botón para crear y abrir la planilla.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {url ? (
                          <>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ugi-btn ok flex-1"
                              style={{ minHeight: '42px', fontSize: '0.84rem' }}
                            >
                              <ExternalLink size={15} /> Abrir Sheet {d.nombre}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                sincronizarGoogleSheetDeporte(d.nombre, true, false)
                              }
                              disabled={sincronizandoSheet}
                              className="ugi-btn-sec"
                              style={{ minHeight: '42px' }}
                            >
                              <RefreshCw
                                size={14}
                                className={sincronizandoSheet ? 'animate-spin' : ''}
                              />
                              Sincronizar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              sincronizarGoogleSheetDeporte(d.nombre, false, true)
                            }
                            disabled={sincronizandoSheet}
                            className="ugi-btn ok w-full"
                            style={{ minHeight: '42px', fontSize: '0.84rem' }}
                          >
                            <ExternalLink size={15} /> Crear / Abrir Sheet {d.nombre}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {rolSesion === 'admin' && (
                <div className="pt-3 border-t border-slate-200">
                  <label htmlFor="input-script-url" className="ugi-label">
                    URL del Web App de Google Apps Script (/exec)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="input-script-url"
                      type="url"
                      value={googleScriptUrl}
                      onChange={(e) => setGoogleScriptUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="ugi-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={guardarMotorEnSupabase}
                      disabled={guardandoMotorGlobal}
                      className="ugi-btn"
                      style={{ width: 'auto', minHeight: '48px' }}
                    >
                      {guardandoMotorGlobal ? 'Guardando...' : 'Guardar URL'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* TOAST DE NOTIFICACIÓN ESTILO DEPORTES UGI */}
      {toastMsg && (
        <div role="status" aria-live="polite" className="ugi-toast">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
