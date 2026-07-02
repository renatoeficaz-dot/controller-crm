"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

let idCounter = 1;
const newNodeId = () => `n${Date.now()}_${idCounter++}`;

// Nó de mensagem: textarea editável inline + marcação de "início do fluxo"
function MessageNode({ id, data }) {
  return (
    <div
      className={`rounded-lg border-2 bg-white shadow-sm w-56 ${
        data.isStart ? "border-emerald-500" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div className="px-2 py-1 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-500">
          {data.isStart ? "🟢 Início" : "Mensagem"}
        </span>
        <button
          onClick={() => data.onSetStart?.(id)}
          title="Marcar como início do fluxo"
          className="text-[10px] text-slate-400 hover:text-emerald-600"
        >
          início
        </button>
      </div>
      <textarea
        value={data.message || ""}
        onChange={(e) => data.onChangeMessage?.(id, e.target.value)}
        placeholder="Mensagem que o bot envia…"
        rows={3}
        className="w-full text-xs px-2 py-1.5 outline-none resize-none nodrag"
      />
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  );
}

const nodeTypes = { message: MessageNode };

export default function ChatbotBuilder() {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState(null);
  const [flow, setFlow] = useState(null); // dados completos do fluxo selecionado
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirtyRef = useRef(false);

  const loadFlows = useCallback(async () => {
    const list = await fetch("/api/chatbot/flows").then((r) => r.json()).catch(() => []);
    setFlows(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => { loadFlows(); }, [loadFlows]);

  const onChangeMessage = useCallback((id, message) => {
    dirtyRef.current = true;
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, message } } : n)));
  }, []);

  const onSetStart = useCallback((id) => {
    dirtyRef.current = true;
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id } })));
  }, []);

  const selectFlow = useCallback(async (id) => {
    setSelectedFlowId(id);
    const f = await fetch(`/api/chatbot/flows/${id}`).then((r) => r.json());
    setFlow(f);
    const loadedNodes = JSON.parse(f.nodesJson || "[]").map((n) => ({
      ...n,
      type: "message",
      data: { ...n.data, onChangeMessage, onSetStart },
    }));
    setNodes(loadedNodes);
    setEdges(JSON.parse(f.edgesJson || "[]"));
    dirtyRef.current = false;
  }, [onChangeMessage, onSetStart]);

  async function createFlow() {
    const name = prompt("Nome do fluxo:", "Novo fluxo");
    if (!name) return;
    const f = await fetch("/api/chatbot/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => r.json());
    await loadFlows();
    selectFlow(f.id);
  }

  async function removeFlow(id) {
    if (!confirm("Excluir este fluxo?")) return;
    await fetch(`/api/chatbot/flows/${id}`, { method: "DELETE" });
    if (selectedFlowId === id) {
      setSelectedFlowId(null);
      setFlow(null);
      setNodes([]);
      setEdges([]);
    }
    loadFlows();
  }

  async function toggleActive() {
    if (!flow) return;
    const active = !flow.active;
    await fetch(`/api/chatbot/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setFlow((f) => ({ ...f, active }));
    loadFlows();
  }

  async function setTrigger(triggerKeyword) {
    setFlow((f) => ({ ...f, triggerKeyword }));
    dirtyRef.current = true;
  }

  function addNode() {
    const id = newNodeId();
    const node = {
      id,
      type: "message",
      position: { x: 80 + nodes.length * 40, y: 80 + nodes.length * 40 },
      data: { message: "", isStart: nodes.length === 0, onChangeMessage, onSetStart },
    };
    dirtyRef.current = true;
    setNodes((nds) => [...nds, node]);
  }

  const onNodesChange = useCallback((changes) => {
    dirtyRef.current = true;
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);
  const onEdgesChange = useCallback((changes) => {
    dirtyRef.current = true;
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const onConnect = useCallback((connection) => {
    dirtyRef.current = true;
    setEdges((eds) => addEdge({ ...connection, label: "", type: "default" }, eds));
  }, []);

  function editEdgeLabel(edgeId) {
    const current = edges.find((e) => e.id === edgeId);
    const label = prompt(
      "Palavra-chave que a resposta do cliente deve conter para seguir por aqui (deixe vazio para ser o caminho padrão):",
      current?.label || ""
    );
    if (label === null) return;
    dirtyRef.current = true;
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, label } : e)));
  }

  async function save() {
    if (!flow) return;
    setSaving(true);
    const cleanNodes = nodes.map(({ id, type, position, data }) => ({
      id, type, position, data: { message: data.message || "", isStart: !!data.isStart },
    }));
    const cleanEdges = edges.map(({ id, source, target, label }) => ({ id, source, target, label: label || "" }));
    await fetch(`/api/chatbot/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: cleanNodes,
        edges: cleanEdges,
        triggerKeyword: flow.triggerKeyword || "",
      }),
    });
    setSaving(false);
    setSaved(true);
    dirtyRef.current = false;
    setTimeout(() => setSaved(false), 1500);
    loadFlows();
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Lista de fluxos */}
      <div className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-slate-800 text-sm">Fluxos</h2>
          <button onClick={createFlow} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            + Novo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll">
          {flows.map((f) => (
            <button
              key={f.id}
              onClick={() => selectFlow(f.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${
                selectedFlowId === f.id ? "bg-emerald-50" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700 truncate">{f.name}</span>
                {f.active && <span className="text-[9px] bg-emerald-500 text-white rounded-full px-1.5 py-0.5 shrink-0">ATIVO</span>}
              </div>
            </button>
          ))}
          {flows.length === 0 && <p className="text-xs text-slate-400 p-4">Nenhum fluxo ainda. Clique em + Novo.</p>}
        </div>
      </div>

      {/* Editor visual */}
      <div className="flex-1 flex flex-col min-h-0">
        {flow ? (
          <>
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3 shrink-0">
              <span className="text-sm font-medium text-slate-800">{flow.name}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Palavra-chave de gatilho:
                <input
                  value={flow.triggerKeyword || ""}
                  onChange={(e) => setTrigger(e.target.value)}
                  placeholder="vazio = 1ª msg de lead novo"
                  className="border border-slate-200 rounded px-2 py-1 text-xs w-44 outline-none focus:border-emerald-400"
                />
              </label>
              <button
                onClick={toggleActive}
                className={`text-xs rounded-lg px-3 py-1.5 font-medium ${
                  flow.active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-500 text-white hover:bg-emerald-600"
                }`}
              >
                {flow.active ? "Desativar" : "Ativar fluxo"}
              </button>
              <button onClick={addNode} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                + Bloco de mensagem
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900 disabled:opacity-50"
              >
                {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar fluxo"}
              </button>
              <button onClick={() => removeFlow(flow.id)} className="text-xs text-red-400 hover:text-red-600 ml-auto">
                Excluir fluxo
              </button>
            </div>
            <p className="px-4 py-1.5 text-[11px] text-slate-400 bg-amber-50 border-b border-amber-100 shrink-0">
              Arraste da borda direita de um bloco até outro para conectar. Clique numa seta para definir a palavra-chave que leva por ali (vazio = caminho padrão).
            </p>
            <div className="flex-1 min-h-0">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onEdgeClick={(_e, edge) => editEdgeLabel(edge.id)}
                nodeTypes={nodeTypes}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Selecione ou crie um fluxo para editar
          </div>
        )}
      </div>
    </div>
  );
}
