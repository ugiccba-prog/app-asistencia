'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import {
  Download,
  CheckCircle,
  Clock,
  XCircle,
  Utensils,
  Plus,
  Edit2,
  UserPlus,
  Trash2,
  ShieldAlert,
  ArrowLeft,
  Lock,
  Users,
  CheckCircle2,
} from 'lucide-react';

// Conexión a Supabase
const supabaseUrl = 'https://eohxmexldfjfkjdymwlm.supabase.co';
const supabaseAnonKey = 'sb_publishable_mtZs0Bn0FXsY57jHiGdFbQ_z1R03p2L';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Contraseña para el Panel Maestro de UGI
const CLAVE_ADMIN = 'ugi2026';

// Lista oficial de Deportes definida por UGI
const DEPORTES_OFICIALES = [
  { nombre: 'Colonia', tipo: 'colonia' as const },
  { nombre: 'Hockey sobre Patines', tipo: 'deporte' as const },
  { nombre: 'Hockey sobre Césped', tipo: 'deporte' as const },
  { nombre: 'Básquet', tipo: 'deporte' as const },
  { nombre: 'Fútbol', tipo: 'deporte' as const },
  { nombre: 'Vóley', tipo: 'deporte' as const },
  { nombre: 'Rugby', tipo: 'deporte' as const },
  { nombre: 'Natación', tipo: 'deporte' as const },
  { nombre: 'Tenis', tipo: 'deporte' as const },
  { nombre: 'Handball', tipo: 'deporte' as const },
  { nombre: 'Gimnasia', tipo: 'deporte' as const },
  { nombre: 'Patín Artístico', tipo: 'deporte' as const },
];

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
}

interface AsistenciaState {
  estado: 'presente' | 'ausente' | 'tarde';
  almuerzo: boolean;
}

export default function AsistenciaApp() {
  const hoy = new Date().toISOString().split('T')[0];

  // Control de Vista: Profes vs Admin
  const [vista, setVista] = useState<'profe' | 'login_admin' | 'admin'>('profe');
  const [inputClave, setInputClave] = useState('');

  // Estados Vista Profe
  const [deporteSeleccionado, setDeporteSeleccionado] = useState<string>(DEPORTES_OFICIALES[0].nombre);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<number | null>(null);

  const [modoCategoria, setModoCategoria] = useState<'ninguno' | 'crear' | 'editar'>('ninguno');
  const [inputCategoria, setInputCategoria] = useState('');

  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [mostrarFormAlumno, setMostrarFormAlumno] = useState(false);

  const [asistencias, setAsistencias] = useState<{ [key: number]: AsistenciaState }>({});
  const [fecha, setFecha] = useState<string>(hoy);
  const [cargando, setCargando] = useState(false);

  // Estados Vista Admin (Excel Maestro)
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtroDeporteAdmin, setFiltroDeporteAdmin] = useState<string>('TODOS');
  const [registrosAdmin, setRegistrosAdmin] = useState<any[]>([]);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);

  const cargarGrupos = async (deporteActual: string, idSeleccionar?: number) => {
    const { data } = await supabase.from('grupos').select('*').order('categoria');
    if (data) {
      setGrupos(data);
      const filtrados = data.filter((g) => g.nombre === deporteActual);
      if (idSeleccionar) {
        setGrupoSeleccionado(idSeleccionar);
      } else if (filtrados.length > 0) {
        setGrupoSeleccionado(filtrados[0].id);
      } else {
        setGrupoSeleccionado(null);
      }
    }
  };

  useEffect(() => {
    cargarGrupos(deporteSeleccionado);
  }, [deporteSeleccionado]);

  const cargarAlumnosYAsistencias = async () => {
    if (!grupoSeleccionado) {
      setAlumnos([]);
      setAsistencias({});
      return;
    }

    const { data: alumnosData } = await supabase
      .from('alumnos')
      .select('*')
      .eq('grupo_id', grupoSeleccionado)
      .eq('activo', true)
      .order('apellido');

    if (alumnosData) {
      setAlumnos(alumnosData);
      const ids = alumnosData.map((a) => a.id);

      const mapaAsistencias: { [key: number]: AsistenciaState } = {};
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
              almuerzo: existente.almuerzo,
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
    cargarAlumnosYAsistencias();
  }, [grupoSeleccionado, fecha]);

  const cargarReporteMaestro = async () => {
    setCargandoAdmin(true);
    const { data, error } = await supabase
      .from('asistencias')
      .select(`
        id,
        fecha,
        estado,
        almuerzo,
        alumnos (
          id,
          nombre,
          apellido,
          grupos (
            id,
            nombre,
            categoria,
            tipo
          )
        )
      `)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false });

    if (!error && data) {
      setRegistrosAdmin(data);
    }
    setCargandoAdmin(false);
  };

  useEffect(() => {
    if (vista === 'admin') {
      cargarReporteMaestro();
    }
  }, [vista, fechaDesde, fechaHasta]);

  const ingresarAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputClave === CLAVE_ADMIN) {
      setInputClave('');
      setVista('admin');
    } else {
      alert('Contraseña incorrecta');
    }
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
        alert('Error al crear categoría: ' + error.message);
      } else if (data) {
        setModoCategoria('ninguno');
        setInputCategoria('');
        await cargarGrupos(deporteSeleccionado, data.id);
      }
    } else if (modoCategoria === 'editar' && grupoSeleccionado) {
      const { error } = await supabase
        .from('grupos')
        .update({ categoria: inputCategoria.trim() })
        .eq('id', grupoSeleccionado);

      if (error) {
        alert('Error al editar categoría: ' + error.message);
      } else {
        setModoCategoria('ninguno');
        setInputCategoria('');
        await cargarGrupos(deporteSeleccionado, grupoSeleccionado);
      }
    }
  };

  const agregarAlumno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grupoSeleccionado || !nuevoNombre.trim() || !nuevoApellido.trim()) return;

    const { error } = await supabase.from('alumnos').insert([
      {
        grupo_id: grupoSeleccionado,
        nombre: nuevoNombre.trim(),
        apellido: nuevoApellido.trim(),
        activo: true,
      },
    ]);

    if (error) {
      alert('Error al agregar alumno: ' + error.message);
    } else {
      setNuevoNombre('');
      setNuevoApellido('');
      await cargarAlumnosYAsistencias();
    }
  };

  const eliminarAlumno = async (id: number, nombreCompleto: string) => {
    if (!confirm(`¿Quitar a ${nombreCompleto} de esta categoría?`)) return;
    await supabase.from('alumnos').update({ activo: false }).eq('id', id);
    await cargarAlumnosYAsistencias();
  };

  const handleEstado = (id: number, nuevoEstado: 'presente' | 'ausente' | 'tarde') => {
    setAsistencias((prev) => ({
      ...prev,
      [id]: {
        estado: nuevoEstado,
        almuerzo: nuevoEstado === 'ausente' ? false : prev[id]?.almuerzo || false,
      },
    }));
  };

  const handleAlmuerzo = (id: number) => {
    setAsistencias((prev) => ({
      ...prev,
      [id]: { ...prev[id], almuerzo: !prev[id]?.almuerzo },
    }));
  };

  const guardarAsistencias = async () => {
    if (alumnos.length === 0) return;
    setCargando(true);
    const registros = alumnos.map((al) => ({
      fecha,
      alumno_id: al.id,
      estado: asistencias[al.id]?.estado || 'presente',
      almuerzo: asistencias[al.id]?.almuerzo || false,
    }));

    const { error } = await supabase
      .from('asistencias')
      .upsert(registros, { onConflict: 'fecha,alumno_id' });
    setCargando(false);

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      alert('¡Asistencia guardada correctamente!');
    }
  };

  const exportarExcelProfe = () => {
    const grupoActual = grupos.find((g) => g.id === Number(grupoSeleccionado));
    if (!grupoActual || alumnos.length === 0) return;

    const dataParaExcel = alumnos.map((al) => {
      const registro = asistencias[al.id] || { estado: 'presente', almuerzo: false };
      return {
        Fecha: fecha,
        Deporte: grupoActual.nombre,
        Categoría: grupoActual.categoria,
        Alumno: `${al.apellido}, ${al.nombre}`,
        Estado: registro.estado.toUpperCase(),
        Almuerzo: grupoActual.tipo === 'colonia' ? (registro.almuerzo ? 'SÍ' : 'NO') : 'N/A',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataParaExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencia');
    XLSX.writeFile(workbook, `Asistencia_${grupoActual.nombre}_${grupoActual.categoria}_${fecha}.xlsx`);
  };

  const descargarExcelMaestro = () => {
    const filtrados = registrosAdmin.filter((r: any) =>
      filtroDeporteAdmin === 'TODOS' ? true : r.alumnos?.grupos?.nombre === filtroDeporteAdmin
    );

    if (filtrados.length === 0) {
      alert('No hay asistencias registradas con estos filtros.');
      return;
    }

    const filasDetalle = filtrados.map((r: any) => {
      const alumno = r.alumnos;
      const grupo = alumno?.grupos;
      return {
        Fecha: r.fecha,
        Tipo: grupo?.tipo?.toUpperCase() || '',
        Deporte_Actividad: grupo?.nombre || '',
        Categoría: grupo?.categoria || '',
        Alumno: alumno ? `${alumno.apellido}, ${alumno.nombre}` : '',
        Estado: r.estado.toUpperCase(),
        Almuerzo: grupo?.tipo === 'colonia' ? (r.almuerzo ? 'SÍ' : 'NO') : 'N/A',
      };
    });

    const workbook = XLSX.utils.book_new();
    const hojaGeneral = XLSX.utils.json_to_sheet(filasDetalle);
    XLSX.utils.book_append_sheet(workbook, hojaGeneral, 'Reporte Maestro UGI');
    XLSX.writeFile(workbook, `Reporte_Maestro_UGI_${fechaDesde}_a_${fechaHasta}.xlsx`);
  };

  if (vista === 'login_admin') {
    return (
      <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm p-6 w-full max-w-sm border border-slate-200">
          <div className="flex justify-center mb-3 text-blue-600">
            <Lock size={32} />
          </div>
          <h2 className="text-lg font-bold text-slate-800 text-center mb-1">
            Acceso Director UGI
          </h2>
          <p className="text-xs text-slate-500 text-center mb-4">
            Ingresá la clave para ver el Tablero General y descargar el Excel Maestro.
          </p>
          <form onSubmit={ingresarAdmin} className="space-y-3">
            <input
              type="password"
              placeholder="Contraseña..."
              value={inputClave}
              onChange={(e) => setInputClave(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 text-center"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVista('profe')}
                className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700"
              >
                Ingresar
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  if (vista === 'admin') {
    const registrosFiltrados = registrosAdmin.filter((r: any) =>
      filtroDeporteAdmin === 'TODOS' ? true : r.alumnos?.grupos?.nombre === filtroDeporteAdmin
    );
    const totalPresentes = registrosFiltrados.filter(
      (r) => r.estado === 'presente' || r.estado === 'tarde'
    ).length;
    const totalAlmuerzosAdmin = registrosFiltrados.filter((r) => r.almuerzo).length;

    return (
      <main className="min-h-screen bg-slate-100 p-4 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-5 mb-4 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setVista('profe')}
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              <ArrowLeft size={14} /> Volver a Pantalla de Profes
            </button>
            <span className="text-xs bg-slate-800 text-white px-2.5 py-1 rounded font-bold">
              PANEL MAESTRO UGI
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-800 mb-1">
            Tablero General y Excel Maestro
          </h1>
          <p className="text-xs text-slate-500 mb-5">
            Unidad de Gestión Integral • Club Ciudad de Buenos Aires
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end bg-slate-50 p-3 rounded-lg border border-slate-200 mb-5">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Desde:</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Hasta:</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Deporte:</label>
              <select
                value={filtroDeporteAdmin}
                onChange={(e) => setFiltroDeporteAdmin(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
              >
                <option value="TODOS">Todos los deportes</option>
                {DEPORTES_OFICIALES.map((d) => (
                  <option key={d.nombre} value={d.nombre}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={descargarExcelMaestro}
              className="bg-emerald-600 text-white py-2 px-3 rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-700 flex items-center justify-center gap-1.5 h-[34px]"
            >
              <Download size={15} /> Excel Maestro
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs text-blue-700 font-medium flex items-center gap-1">
                <Users size={14} /> Registros
              </div>
              <div className="text-2xl font-bold text-blue-900 mt-1">
                {registrosFiltrados.length}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 size={14} /> Presentes / Tardes
              </div>
              <div className="text-2xl font-bold text-emerald-900 mt-1">{totalPresentes}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs text-amber-700 font-medium flex items-center gap-1">
                <Utensils size={14} /> Almuerzos
              </div>
              <div className="text-2xl font-bold text-amber-900 mt-1">
                {totalAlmuerzosAdmin}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="p-2.5">Fecha</th>
                  <th className="p-2.5">Deporte / Colonia</th>
                  <th className="p-2.5">Categoría</th>
                  <th className="p-2.5">Alumno</th>
                  <th className="p-2.5">Estado</th>
                  <th className="p-2.5">Almuerzo</th>
                </tr>
              </thead>
              <tbody>
                {cargandoAdmin ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      Cargando asistencias...
                    </td>
                  </tr>
                ) : registrosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      No hay asistencias guardadas para este filtro.
                    </td>
                  </tr>
                ) : (
                  registrosFiltrados.map((r: any) => {
                    const al = r.alumnos;
                    const gr = al?.grupos;
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2.5 font-medium text-slate-700">{r.fecha}</td>
                        <td className="p-2.5 text-slate-700">{gr?.nombre}</td>
                        <td className="p-2.5 text-slate-600">{gr?.categoria}</td>
                        <td className="p-2.5 font-semibold text-slate-800">
                          {al?.apellido}, {al?.nombre}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.estado === 'presente'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.estado === 'tarde'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {r.estado}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">
                          {gr?.tipo === 'colonia' ? (r.almuerzo ? '🍴 Sí' : 'No') : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    );
  }

  const categoriasDelDeporte = grupos.filter((g) => g.nombre === deporteSeleccionado);
  const grupoActual = grupos.find((g) => g.id === Number(grupoSeleccionado));
  const esColonia =
    DEPORTES_OFICIALES.find((d) => d.nombre === deporteSeleccionado)?.tipo === 'colonia';
  const totalAlmuerzos = Object.values(asistencias).filter((a) => a.almuerzo).length;

  return (
    <main className="min-h-screen bg-slate-100 p-4 max-w-xl mx-auto pb-24">
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border border-slate-200">
        <div className="flex justify-between items-start mb-1">
          <div className="w-6" />
          <h1 className="text-lg font-bold text-slate-800 text-center">
            Unidad de Gestión Integral - Asistencia
          </h1>
          <button
            type="button"
            onClick={() => setVista('login_admin')}
            className="text-slate-400 hover:text-blue-600 transition-colors p-1"
            title="Acceso Director UGI"
          >
            <ShieldAlert size={18} />
          </button>
        </div>
        <p className="text-xs text-center text-slate-500 mb-4">
          Control de Deportes y Colonia • Club Ciudad de Buenos Aires
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              1. Deporte / Actividad:
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-800 font-medium"
              value={deporteSeleccionado}
              onChange={(e) => {
                setDeporteSeleccionado(e.target.value);
                setModoCategoria('ninguno');
              }}
            >
              {DEPORTES_OFICIALES.map((dep) => (
                <option key={dep.nombre} value={dep.nombre}>
                  {dep.nombre} ({dep.tipo.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-600">
                2. Categoría / Grupo:
              </label>
              <div className="flex gap-2">
                {grupoSeleccionado && (
                  <button
                    type="button"
                    onClick={() => {
                      setModoCategoria('editar');
                      setInputCategoria(grupoActual?.categoria || '');
                    }}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Edit2 size={12} /> Editar nombre
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setModoCategoria('crear');
                    setInputCategoria('');
                  }}
                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-100 flex items-center gap-1 font-semibold"
                >
                  <Plus size={12} /> Nueva Categoría
                </button>
              </div>
            </div>

            {categoriasDelDeporte.length > 0 ? (
              <select
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-800"
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
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                Aún no hay categorías en <b>{deporteSeleccionado}</b>. Tocá{' '}
                <b>&quot;+ Nueva Categoría&quot;</b> arriba para crear la tuya.
              </div>
            )}

            {modoCategoria !== 'ninguno' && (
              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Ej: Sub 15, Formativa, Grupo 6 años..."
                  value={inputCategoria}
                  onChange={(e) => setInputCategoria(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={guardarCategoria}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-700"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setModoCategoria('ninguno')}
                  className="text-xs text-slate-500 px-2 py-1 hover:text-slate-700"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">3. Fecha:</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm text-slate-800"
            />
          </div>
        </div>

        {esColonia && grupoSeleccionado && (
          <div className="mt-4 p-2 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between text-amber-800 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <Utensils size={18} /> Almuerzos hoy:
            </span>
            <span className="text-base font-bold bg-amber-200 px-2 py-0.5 rounded">
              {totalAlmuerzos}
            </span>
          </div>
        )}
      </div>

      {grupoSeleccionado && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-xs font-bold text-slate-600 uppercase">
              Alumnos ({alumnos.length})
            </span>
            <button
              type="button"
              onClick={() => setMostrarFormAlumno(!mostrarFormAlumno)}
              className="text-xs bg-white border border-slate-300 text-slate-700 px-2.5 py-1 rounded-lg shadow-xs hover:bg-slate-50 flex items-center gap-1 font-semibold"
            >
              <UserPlus size={14} /> {mostrarFormAlumno ? 'Cerrar carga' : 'Agregar Alumno'}
            </button>
          </div>

          {mostrarFormAlumno && (
            <form
              onSubmit={agregarAlumno}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs mb-3 flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                placeholder="Apellido"
                value={nuevoApellido}
                onChange={(e) => setNuevoApellido(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
              <input
                type="text"
                placeholder="Nombre"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
              <button
                type="submit"
                className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700"
              >
                + Sumar a la lista
              </button>
            </form>
          )}
        </div>
      )}

      <div className="space-y-2">
        {grupoSeleccionado && alumnos.length === 0 && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
            No hay alumnos cargados en <b>{grupoActual?.categoria}</b>. Tocá{' '}
            <b>&quot;Agregar Alumno&quot;</b> para armar tu lista.
          </div>
        )}

        {alumnos.map((al) => {
          const actual = asistencias[al.id] || { estado: 'presente', almuerzo: false };

          return (
            <div
              key={al.id}
              className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-700 text-sm">
                  {al.apellido}, {al.nombre}
                </span>

                <div className="flex items-center gap-2">
                  {esColonia && actual.estado !== 'ausente' && (
                    <button
                      type="button"
                      onClick={() => handleAlmuerzo(al.id)}
                      className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium border transition-colors ${
                        actual.almuerzo
                          ? 'bg-orange-500 text-white border-orange-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      <Utensils size={12} />
                      {actual.almuerzo ? 'Almuerza' : 'Sin Almuerzo'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => eliminarAlumno(al.id, `${al.apellido}, ${al.nombre}`)}
                    className="text-slate-300 hover:text-rose-500 p-1"
                    title="Quitar alumno"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleEstado(al.id, 'presente')}
                  className={`py-1.5 text-xs font-semibold rounded-md flex justify-center items-center gap-1 ${
                    actual.estado === 'presente'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <CheckCircle size={14} /> Presente
                </button>
                <button
                  type="button"
                  onClick={() => handleEstado(al.id, 'tarde')}
                  className={`py-1.5 text-xs font-semibold rounded-md flex justify-center items-center gap-1 ${
                    actual.estado === 'tarde'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Clock size={14} /> Tarde
                </button>
                <button
                  type="button"
                  onClick={() => handleEstado(al.id, 'ausente')}
                  className={`py-1.5 text-xs font-semibold rounded-md flex justify-center items-center gap-1 ${
                    actual.estado === 'ausente'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <XCircle size={14} /> Ausente
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto p-3 bg-white border-t border-slate-200 flex gap-2">
        <button
          onClick={guardarAsistencias}
          disabled={cargando || alumnos.length === 0}
          className="flex-1 bg-blue-600 disabled:bg-slate-300 text-white py-2.5 rounded-lg text-sm font-bold shadow-xs hover:bg-blue-700 transition-colors"
        >
          {cargando ? 'Guardando...' : 'Guardar Asistencia'}
        </button>

        <button
          onClick={exportarExcelProfe}
          disabled={alumnos.length === 0}
          className="bg-emerald-600 disabled:bg-slate-300 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
          title="Descargar Excel del grupo"
        >
          <Download size={16} /> Excel
        </button>
      </div>
    </main>
  );
}