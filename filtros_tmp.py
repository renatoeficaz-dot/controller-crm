import io


def edit(p, fn):
    s = io.open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    s = fn(s)
    if crlf:
        s = s.replace("\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(s)


def api(s):
    o = "contact: { select: { id: true, name: true, phone: true, responsavel: true } },\n      tipo:"
    assert s.count(o) == 1
    return s.replace(o, "contact: { select: { id: true, name: true, phone: true, responsavel: true, stage: { select: { id: true, name: true } } } },\n      tipo:")


def tarefas(s):
    def rep(o, n):
        nonlocal s
        assert s.count(o) == 1, (o[:60], s.count(o))
        s = s.replace(o, n)

    rep('  const [fResponsavel, setFResponsavel] = useState(""); // "" = todos; nome do usuário = só as tarefas dele\n',
        '  const [fResponsavel, setFResponsavel] = useState(""); // "" = todos; nome do usuário = só as tarefas dele\n'
        '  const [fEtapas, setFEtapas] = useState([]); // ids das etapas do funil do lead (vazio = todas)\n'
        '  const [stagesList, setStagesList] = useState([]);\n'
        '  const [filtrosAbertos, setFiltrosAbertos] = useState(false);\n')
    rep('''    setTasks(Array.isArray(data) ? data : []);
  }, [fStatus, fTipo, fResponsavel]);''',
        '''    const lista = Array.isArray(data) ? data : [];
    setTasks(fEtapas.length ? lista.filter((t) => fEtapas.includes(t.contact?.stage?.id)) : lista);
  }, [fStatus, fTipo, fResponsavel, fEtapas]);''')
    rep('    setTipos(Array.isArray(tp) ? tp : []);\n',
        '    setTipos(Array.isArray(tp) ? tp : []);\n    setStagesList((Array.isArray(stages) ? stages : []).map((s) => ({ id: s.id, name: s.name, color: s.color })));\n')

    a = s.index('      <div className="flex flex-wrap items-center gap-2">\n        {[\n          { key: "pendentes"')
    b = s.index('        <button\n          onClick={() => { setIndiceFoco(0); setModoFoco(true); }}', a)
    novo = '''      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltrosAbertos(true)}
          className={`flex items-center gap-1 text-xs rounded-full px-3.5 py-1.5 border transition-colors ${
            filtrosAtivos > 0 ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          Filtros
          {filtrosAtivos > 0 && (
            <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none">{filtrosAtivos}</span>
          )}
        </button>
        <span className="text-xs text-slate-400">
          {fStatus === "pendentes" ? "Pendentes" : fStatus === "concluidas" ? "Concluídas" : "Todas"}
        </span>
'''
    s = s[:a] + novo + s[b:]

    rep('''  // Modo foco: uma tarefa pendente por vez''', '''  const filtrosAtivos = (fStatus !== "pendentes" ? 1 : 0) + (fTipo ? 1 : 0) + (fResponsavel ? 1 : 0) + (fEtapas.length ? 1 : 0);

  // Modo foco: uma tarefa pendente por vez''')

    modal = '''      {filtrosAbertos && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setFiltrosAbertos(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-semibold text-slate-800">Filtros</h3>
              <div className="flex items-center gap-3">
                {filtrosAtivos > 0 && (
                  <button onClick={() => { setFStatus("pendentes"); setFTipo(""); setFResponsavel(""); setFEtapas([]); }} className="text-xs text-red-400 hover:text-red-600">Limpar tudo</button>
                )}
                <button onClick={() => setFiltrosAbertos(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <span className="text-xs text-slate-400">Situação</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[["pendentes", "Pendentes"], ["concluidas", "Concluídas"], ["todas", "Todas"]].map(([k, l]) => (
                    <button key={k} onClick={() => setFStatus(k)} className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${fStatus === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-xs text-slate-400">Tipo de tarefa</span>
                <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                  <option value="">Todos os tipos</option>
                  {tipos.map((t) => (<option key={t.id} value={t.id}>{t.emoji ? `${t.emoji} ` : ""}{t.name}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Responsável</span>
                <select value={fResponsavel} onChange={(e) => setFResponsavel(e.target.value)} className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-emerald-400">
                  <option value="">Todos os responsáveis</option>
                  {users.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                </select>
              </label>
              <div>
                <span className="text-xs text-slate-400">Etapa do funil do lead</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {stagesList.map((st) => {
                    const on = fEtapas.includes(st.id);
                    return (
                      <button
                        key={st.id}
                        onClick={() => setFEtapas((l) => (on ? l.filter((i) => i !== st.id) : [...l, st.id]))}
                        className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${on ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                      >
                        {st.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => setFiltrosAbertos(false)} className="w-full text-sm bg-emerald-500 text-white rounded-lg py-2 hover:bg-emerald-600">Ver tarefas</button>
            </div>
          </div>
        </div>
      )}

'''
    marker = "      {visao === \"calendario\" && ("
    rep(marker, modal + marker)
    return s


edit("app/api/tasks/route.js", api)
edit("components/TarefasView.jsx", tarefas)
print("ok")
