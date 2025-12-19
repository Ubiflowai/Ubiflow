'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group, Rect, Transformer } from 'react-konva';
import useImage from 'use-image';
import DxfParser from 'dxf-parser';
import * as pdfjsLib from 'pdfjs-dist';
import jsPDF from 'jspdf';

// --- CONFIGURATION ---
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const BED_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/2317/2317981.png'; 
const SOURCE_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/9368/9368210.png';
const VALVE_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/3572/3572174.png'; // New Valve Icon

const GAS_LAYERS = {
    O2: { label: "Oxygen (O2)", color: "#16a34a", code: "O2" },       
    MA4: { label: "Medical Air (MA4)", color: "#475569", code: "MA4" }, 
    VAC: { label: "Vacuum (VAC)", color: "#eab308", code: "VAC" }       
};

const LAYER_OFFSETS: Record<string, number> = { O2: 0, MA4: -20, VAC: 20 };

// --- HELPER COMPONENTS ---
const ItemImage = ({ src, width, height }: { src: string, width: number, height: number }) => {
    const [image] = useImage(src, 'anonymous');
    return <KonvaImage image={image} width={width} height={height} offsetX={width/2} offsetY={height/2} />;
};

const URLImage = ({ src }: { src: string }) => {
  const [image] = useImage(src);
  return <KonvaImage image={image} />;
};

const GridLayer = ({ scale, visible, darkMode }: { scale: number, visible: boolean, darkMode: boolean }) => {
    if (!visible) return null;
    const lines = [];
    const gridSize = 50; const size = 5000;
    const color = darkMode ? "#334155" : "#e2e8f0"; // Darker grid for dark mode
    for (let i = 0; i < size/gridSize; i++) {
        lines.push(<Line key={`v-${i}`} points={[i*gridSize, 0, i*gridSize, size]} stroke={color} strokeWidth={1/scale} />);
        lines.push(<Line key={`h-${i}`} points={[0, i*gridSize, size, i*gridSize]} stroke={color} strokeWidth={1/scale} />);
    }
    return <Group>{lines}</Group>;
};

// --- TYPES ---
interface DesignerProps { currentRoomType?: string; onBedCountChange?: (n: number) => void; }
type Drawable = { id: number, type: 'LINE'|'RECT'|'TEXT', points?: number[], x?: number, y?: number, width?: number, height?: number, text?: string, stroke?: string, fill?: string, rotation?: number };
type Item = { id: number, x: number, y: number, type: 'Bed'|'Source'|'Valve', label: string, iconUrl: string, rotation: number };
type Connection = { id: number, start: number, end: number, bendOffset: number, layer: string, length?: number };

// --- MAIN COMPONENT ---
export default function FloorPlanDesigner({ currentRoomType = "General Ward", onBedCountChange = () => {} }: DesignerProps) {
  // --- STATE ---
  const [items, setItems] = useState<Item[]>([]); 
  const [connections, setConnections] = useState<Connection[]>([]); 
  const [drawables, setDrawables] = useState<Drawable[]>([]); 
  const [dxfEntities, setDxfEntities] = useState<any[]>([]); 
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  // View State
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [darkMode, setDarkMode] = useState(false);
  const [snapGrid, setSnapGrid] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({ O2: true, MA4: true, VAC: true });

  // Tool State
  const [activeLayer, setActiveLayer] = useState<'O2' | 'MA4' | 'VAC'>('O2');
  const [editMode, setEditMode] = useState<'PIPE' | 'CAD'>('PIPE');
  const [cadTool, setCadTool] = useState<'NONE' | 'LINE' | 'RECT' | 'TEXT'>('NONE');
  const [drawPipeMode, setDrawPipeMode] = useState(false);
  
  // Selection & Interactions
  const [selectedIds, setSelectedIds] = useState<number[]>([]); 
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null); 
  const [selectedStartId, setSelectedStartId] = useState<number | null>(null);
  const [tempDrawable, setTempDrawable] = useState<Drawable | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, type: string, id: number } | null>(null);

  // Refs & History
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const isDrawing = useRef(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyStep, setHistoryStep] = useState(0);

  // --- HISTORY & UTILS ---
  const saveToHistory = useCallback(() => {
      const snapshot = { items, connections, drawables, dxfEntities };
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(snapshot);
      if (newHistory.length > 20) newHistory.shift();
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
  }, [items, connections, drawables, dxfEntities, history, historyStep]);

  const handleUndo = () => {
      if (historyStep === 0) return;
      const prevStep = historyStep - 1;
      const snapshot = history[prevStep];
      setItems(snapshot.items);
      setConnections(snapshot.connections);
      setDrawables(snapshot.drawables);
      setDxfEntities(snapshot.dxfEntities);
      setHistoryStep(prevStep);
  };

  const calculateLength = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
      return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  // --- FILE IO OPERATIONS ---
  const handleSaveProject = () => {
      const projectData = {
          version: "1.0",
          date: new Date().toISOString(),
          items, connections, drawables, visibleLayers, activeLayer
      };
      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ubiflow_project_${Date.now()}.json`;
      link.click();
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const data = JSON.parse(ev.target?.result as string);
              if (data.items) setItems(data.items);
              if (data.connections) setConnections(data.connections);
              if (data.drawables) setDrawables(data.drawables);
              alert("Project loaded successfully!");
          } catch (err) { alert("Invalid project file."); }
      };
      reader.readAsText(file);
  };

  const handleClearCanvas = () => {
      if (confirm("Are you sure you want to clear the entire design?")) {
          setItems([]); setConnections([]); setDrawables([]); setDxfEntities([]); setImageSrc(null);
          saveToHistory();
      }
  };

  // --- DRAWING LOGIC ---
  const addItem = (type: 'Bed' | 'Source' | 'Valve') => {
      saveToHistory();
      let iconUrl = BED_ICON_URL;
      if (type === 'Source') iconUrl = SOURCE_ICON_URL;
      if (type === 'Valve') iconUrl = VALVE_ICON_URL;

      const stage = stageRef.current;
      const centerX = stage ? (-stage.x() + stage.width()/2)/stage.scaleX() : 100;
      const centerY = stage ? (-stage.y() + stage.height()/2)/stage.scaleY() : 100;
      
      const newItem: Item = { id: Date.now(), x: centerX, y: centerY, type, label: type, iconUrl, rotation: 0 };
      setItems([...items, newItem]);
  };

  const handleItemClick = (id: number) => {
      if (editMode === 'PIPE' && drawPipeMode) {
          if (selectedStartId === null) setSelectedStartId(id);
          else if (selectedStartId !== id) {
              const startItem = items.find(i => i.id === selectedStartId);
              const endItem = items.find(i => i.id === id);
              
              if (startItem && endItem) {
                  // Validate connection logic (Basic)
                  const len = calculateLength(startItem, endItem) / 50; // Approx meters
                  saveToHistory();
                  setConnections([...connections, { 
                      id: Date.now(), 
                      start: selectedStartId, 
                      end: id, 
                      bendOffset: 0, 
                      layer: activeLayer,
                      length: len 
                  }]);
              }
              setSelectedStartId(null);
          }
      }
  };

  // --- CONTEXT MENU ---
  const handleContextMenu = (e: any, type: string, id: number) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      const pointer = stage.getPointerPosition();
      setContextMenu({
          visible: true,
          x: pointer.x + stageRef.current.container().offsetLeft,
          y: pointer.y + stageRef.current.container().offsetTop,
          type, id
      });
  };

  const handleMenuAction = (action: string) => {
      if (!contextMenu) return;
      saveToHistory();
      if (action === 'DELETE') {
          if (contextMenu.type === 'ITEM') {
              setItems(items.filter(i => i.id !== contextMenu.id));
              setConnections(connections.filter(c => c.start !== contextMenu.id && c.end !== contextMenu.id));
          } else if (contextMenu.type === 'PIPE') setConnections(connections.filter(c => c.id !== contextMenu.id));
          else if (contextMenu.type === 'CAD') setDrawables(drawables.filter(d => d.id !== contextMenu.id));
      } else if (action === 'ROTATE') {
          if (contextMenu.type === 'ITEM') setItems(items.map(i => i.id === contextMenu.id ? { ...i, rotation: (i.rotation || 0) + 90 } : i));
      }
      setContextMenu(null);
  };

  // --- MOUSE HANDLERS (CAD & PAN) ---
  const handleStageMouseDown = (e: any) => {
      setContextMenu(null);
      if (e.target === e.target.getStage()) {
          setSelectedConnectionId(null); setSelectedIds([]);
          
          if (editMode === 'CAD' && cadTool !== 'NONE') {
            saveToHistory();
            isDrawing.current = true;
            const stage = e.target.getStage();
            const transform = stage.getAbsoluteTransform().copy().invert();
            const pos = transform.point(stage.getPointerPosition());
            const x = snapGrid ? Math.round(pos.x/50)*50 : pos.x;
            const y = snapGrid ? Math.round(pos.y/50)*50 : pos.y;
            
            const id = Date.now();
            if (cadTool === 'LINE') setTempDrawable({ id, type: 'LINE', points: [x,y,x,y], stroke: darkMode ? 'white' : 'black' });
            else if (cadTool === 'RECT') setTempDrawable({ id, type: 'RECT', x, y, width:0, height:0, stroke: darkMode ? 'white' : 'black' });
            else if (cadTool === 'TEXT') {
                const text = prompt("Enter Label Text:");
                if (text) setDrawables([...drawables, { id, type: 'TEXT', x, y, text, fill: darkMode ? 'white' : 'black' }]);
                setCadTool('NONE'); isDrawing.current = false;
            }
          }
      }
  };

  const handleStageMouseMove = (e: any) => {
      if (!isDrawing.current || !tempDrawable) return;
      const stage = e.target.getStage();
      const transform = stage.getAbsoluteTransform().copy().invert();
      const pos = transform.point(stage.getPointerPosition());
      let x = snapGrid ? Math.round(pos.x/50)*50 : pos.x;
      let y = snapGrid ? Math.round(pos.y/50)*50 : pos.y;

      if (e.evt.shiftKey && tempDrawable.type === 'LINE') {
          // Ortho mode
          if (Math.abs(x - tempDrawable.points![0]) > Math.abs(y - tempDrawable.points![1])) y = tempDrawable.points![1]; 
          else x = tempDrawable.points![0];
      }

      if (tempDrawable.type === 'LINE') setTempDrawable({ ...tempDrawable, points: [tempDrawable.points![0], tempDrawable.points![1], x, y] });
      else if (tempDrawable.type === 'RECT') setTempDrawable({ ...tempDrawable, width: x - tempDrawable.x!, height: y - tempDrawable.y! });
  };

  const handleStageMouseUp = () => {
      isDrawing.current = false;
      if (tempDrawable) { setDrawables([...drawables, tempDrawable]); setTempDrawable(null); }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1; const stage = e.target.getStage(); const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setStageScale(newScale);
    setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  };

  // --- BOM CALCULATIONS ---
  const generateBOM = () => {
      const counts: any = { Bed: 0, Source: 0, Valve: 0 };
      const pipeLengths: any = { O2: 0, MA4: 0, VAC: 0 };
      
      items.forEach(i => counts[i.type] = (counts[i.type] || 0) + 1);
      connections.forEach(c => {
          const start = items.find(i => i.id === c.start);
          const end = items.find(i => i.id === c.end);
          if (start && end) {
             const lenPx = Math.abs(start.x - end.x) + Math.abs(start.y - end.y); // Manhattan distance approx
             pipeLengths[c.layer] += (lenPx / 50); // 50px = 1m approx
          }
      });
      return { counts, pipeLengths };
  };
  const bom = generateBOM();

  // --- RENDER ---
  return (
    <div className={`w-full min-h-screen p-4 flex flex-col gap-4 transition-colors ${darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* TOP HEADER & UTILITIES */}
      <div className={`p-4 rounded-xl border flex justify-between items-center shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex gap-4 items-center">
             <h1 className="text-xl font-black tracking-tight">UBIFLOW <span className="text-blue-500">PRO</span></h1>
             <div className="h-6 w-px bg-slate-300 mx-2"></div>
             <button onClick={handleSaveProject} className="text-xs font-bold px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">💾 Save</button>
             <label className="text-xs font-bold px-3 py-1.5 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer">
                 📂 Load <input type="file" className="hidden" accept=".json" onChange={handleLoadProject} />
             </label>
             <button onClick={handleClearCanvas} className="text-xs font-bold px-3 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200">🗑 Clear</button>
        </div>
        
        <div className="flex gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full ${darkMode ? 'bg-yellow-400 text-black' : 'bg-slate-800 text-white'}`}>
                {darkMode ? '☀️' : '🌙'}
            </button>
        </div>
      </div>
      
      {/* MAIN WORKSPACE */}
      <div className="flex gap-4 h-[700px]">
        
        {/* LEFT TOOLBAR */}
        <div className={`w-64 flex flex-col gap-4 p-4 rounded-xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Mode Switch */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setEditMode('PIPE')} className={`flex-1 py-1 text-xs font-bold rounded ${editMode === 'PIPE' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>PIPE</button>
                <button onClick={() => setEditMode('CAD')} className={`flex-1 py-1 text-xs font-bold rounded ${editMode === 'CAD' ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>CAD</button>
            </div>

            {editMode === 'PIPE' ? (
                <>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active System</div>
                    <select value={activeLayer} onChange={(e) => setActiveLayer(e.target.value as any)} className="p-2 rounded border font-bold text-sm bg-transparent border-slate-400">
                        <option value="O2">Oxygen (O2)</option>
                        <option value="VAC">Vacuum (VAC)</option>
                        <option value="MA4">Medical Air</option>
                    </select>
                    
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Components</div>
                    <button onClick={() => addItem('Source')} className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 border border-transparent hover:border-slate-300 text-left text-sm font-medium">
                        <img src={SOURCE_ICON_URL} width={20} alt="src" /> Gas Source
                    </button>
                    <button onClick={() => addItem('Bed')} className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 border border-transparent hover:border-slate-300 text-left text-sm font-medium">
                        <img src={BED_ICON_URL} width={20} alt="bed" /> Bed / Terminal
                    </button>
                    <button onClick={() => addItem('Valve')} className="flex items-center gap-3 p-2 rounded hover:bg-slate-100 border border-transparent hover:border-slate-300 text-left text-sm font-medium">
                        <img src={VALVE_ICON_URL} width={20} alt="valve" /> Zone Valve
                    </button>

                    <button 
                        onClick={() => { setDrawPipeMode(!drawPipeMode); setSelectedStartId(null); }} 
                        className={`mt-2 py-3 px-4 rounded font-bold text-sm text-center border-2 transition-all ${drawPipeMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500 hover:border-blue-400'}`}>
                        {drawPipeMode ? 'Click Items to Connect' : 'Draw Pipe Connection'}
                    </button>

                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="text-xs font-bold text-slate-400 mb-2">VISIBILITY</div>
                        {Object.keys(GAS_LAYERS).map(gas => (
                            <label key={gas} className="flex items-center gap-2 text-sm mb-1 cursor-pointer">
                                <input type="checkbox" checked={visibleLayers[gas]} onChange={() => setVisibleLayers({...visibleLayers, [gas]: !visibleLayers[gas]})} />
                                <span style={{ color: GAS_LAYERS[gas as keyof typeof GAS_LAYERS].color }}>{gas} Layer</span>
                            </label>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">CAD Tools</div>
                    <button onClick={() => setCadTool('LINE')} className={`p-2 text-sm text-left rounded ${cadTool === 'LINE' ? 'bg-blue-100 text-blue-700 font-bold' : 'hover:bg-slate-100'}`}>📏 Line</button>
                    <button onClick={() => setCadTool('RECT')} className={`p-2 text-sm text-left rounded ${cadTool === 'RECT' ? 'bg-blue-100 text-blue-700 font-bold' : 'hover:bg-slate-100'}`}>⬜ Rectangle</button>
                    <button onClick={() => setCadTool('TEXT')} className={`p-2 text-sm text-left rounded ${cadTool === 'TEXT' ? 'bg-blue-100 text-blue-700 font-bold' : 'hover:bg-slate-100'}`}>🔤 Text Label</button>
                </>
            )}
        </div>

        {/* CANVAS */}
        <div className={`flex-1 relative rounded-xl overflow-hidden shadow-inner border-2 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'}`} onContextMenu={(e) => e.preventDefault()}>
            <Stage ref={stageRef} width={1000} height={700} draggable onWheel={handleWheel} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} onMouseDown={handleStageMouseDown} onMouseMove={handleStageMouseMove} onMouseUp={handleStageMouseUp}>
                <Layer>
                    <GridLayer scale={stageScale} visible={snapGrid} darkMode={darkMode} />
                    
                    {/* DXF / Image Layers */}
                    {imageSrc && <URLImage src={imageSrc} />}
                    <Group>{dxfEntities.map((line) => (<Line key={line.id} points={line.points} stroke={selectedIds.includes(line.id)?'#f97316':'#94a3b8'} strokeWidth={1} />))}</Group>
                    
                    {/* CAD Drawings */}
                    {drawables.map((d) => (
                        d.type === 'LINE' ? <Line key={d.id} points={d.points} stroke={d.stroke} strokeWidth={2} onClick={()=>setSelectedIds([d.id])} onContextMenu={(e:any)=>handleContextMenu(e, 'CAD', d.id)} draggable={editMode==='CAD'} onDragEnd={saveToHistory} /> :
                        d.type === 'RECT' ? <Rect key={d.id} x={d.x} y={d.y} width={d.width} height={d.height} stroke={d.stroke} strokeWidth={2} onClick={()=>setSelectedIds([d.id])} onContextMenu={(e:any)=>handleContextMenu(e, 'CAD', d.id)} draggable={editMode==='CAD'} onDragEnd={saveToHistory} /> :
                        <Text key={d.id} x={d.x} y={d.y} text={d.text} fill={d.fill} fontSize={16} draggable={editMode==='CAD'} onDragEnd={saveToHistory} onContextMenu={(e:any)=>handleContextMenu(e, 'CAD', d.id)} />
                    ))}
                    {tempDrawable?.type==='LINE' && <Line points={tempDrawable.points} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}
                    {tempDrawable?.type==='RECT' && <Rect x={tempDrawable.x} y={tempDrawable.y} width={tempDrawable.width} height={tempDrawable.height} stroke="#f97316" strokeWidth={2} dash={[5,5]} />}

                    {/* Pipe Connections */}
                    {connections.map((conn) => {
                        if (!visibleLayers[conn.layer]) return null;
                        const start = items.find(i => i.id === conn.start);
                        const end = items.find(i => i.id === conn.end);
                        if (!start || !end) return null;
                        const isSel = selectedConnectionId === conn.id;
                        const color = GAS_LAYERS[conn.layer as keyof typeof GAS_LAYERS]?.color || 'black';
                        
                        // Engineering Check: Warn if pipe > 20m (simplified check)
                        const isTooLong = (conn.length || 0) > 20; 
                        const displayColor = isTooLong ? '#ff4500' : color; // OrangeRed if warning

                        const midX = ((start.x + end.x) / 2) + (conn.bendOffset || 0) + (LAYER_OFFSETS[conn.layer] || 0);
                        return (
                            <Group key={conn.id} onContextMenu={(e) => handleContextMenu(e, 'PIPE', conn.id)}>
                                <Line points={[start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]} stroke={isSel ? '#ef4444' : displayColor} strokeWidth={isTooLong ? 6 : 4} lineCap="round" lineJoin="round" onClick={() => setSelectedConnectionId(conn.id)} />
                                {isTooLong && <Text x={midX} y={(start.y+end.y)/2} text="⚠️ Long Run" fontSize={10} fill="red" fontStyle="bold" />}
                                {isSel && editMode === 'PIPE' && <Circle x={midX} y={(start.y+end.y)/2} radius={6} fill="#ef4444" draggable onDragMove={(e) => { const newOffset = e.target.x() - ((start.x+end.x)/2) - (LAYER_OFFSETS[conn.layer]||0); setConnections(connections.map(c => c.id === conn.id ? { ...c, bendOffset: newOffset } : c)); }} onDragEnd={saveToHistory} />}
                            </Group>
                        );
                    })}

                    {/* Items (Beds/Sources) */}
                    {items.map((item) => (
                        <Group key={item.id} draggable={editMode==='PIPE'} x={item.x} y={item.y} rotation={item.rotation}
                            onClick={() => { if(editMode==='PIPE') handleItemClick(item.id); else setSelectedIds([item.id]); }}
                            onContextMenu={(e) => handleContextMenu(e, 'ITEM', item.id)} onDragEnd={saveToHistory}
                        >
                            <ItemImage src={item.iconUrl} width={40} height={40} />
                            <Text y={22} x={-20} text={item.label} fontSize={10} fill={darkMode ? 'white' : 'black'} fontStyle="bold" align="center" width={40} />
                            {selectedStartId === item.id && <Circle radius={25} stroke={GAS_LAYERS[activeLayer].color} strokeWidth={3} dash={[4, 4]} />}
                        </Group>
                    ))}
                    
                    {editMode === 'CAD' && <Transformer ref={transformerRef} />}
                </Layer>
            </Stage>
        </div>
      </div>
      
      {/* BOTTOM PANEL: BOM TABLE */}
      <div className={`p-4 rounded-xl border shadow-sm flex gap-8 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex-1">
              <h3 className="text-sm font-bold uppercase text-slate-400 mb-2">Quantities</h3>
              <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-100 rounded dark:bg-slate-700">
                      <div className="text-2xl font-black">{bom.counts.Bed || 0}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">Terminal Units</div>
                  </div>
                  <div className="p-3 bg-slate-100 rounded dark:bg-slate-700">
                      <div className="text-2xl font-black">{bom.counts.Source || 0}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">Sources</div>
                  </div>
                  <div className="p-3 bg-slate-100 rounded dark:bg-slate-700">
                      <div className="text-2xl font-black">{bom.counts.Valve || 0}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">Zone Valves</div>
                  </div>
              </div>
          </div>
          <div className="flex-1">
              <h3 className="text-sm font-bold uppercase text-slate-400 mb-2">Pipe Schedule (Est. Meters)</h3>
              <table className="w-full text-sm">
                  <tbody>
                      {Object.entries(bom.pipeLengths).map(([gas, len]: [string, any]) => (
                          <tr key={gas} className="border-b dark:border-slate-600">
                              <td className="py-1 font-bold" style={{ color: GAS_LAYERS[gas as keyof typeof GAS_LAYERS].color }}>{gas}</td>
                              <td className="py-1 text-right font-mono">{Math.round(len)}m</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {/* CONTEXT MENU */}
      {contextMenu && (
          <div className="absolute bg-white dark:bg-slate-800 shadow-xl rounded-lg border border-slate-200 dark:border-slate-600 py-1 z-50 flex flex-col min-w-[150px]" style={{ top: contextMenu.y + 20, left: contextMenu.x + 20 }}>
              <div className="px-3 py-1 text-xs font-bold text-slate-400 border-b dark:border-slate-600 mb-1">{contextMenu.type} ACTIONS</div>
              <button onClick={() => handleMenuAction('DELETE')} className="px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">🗑 Delete</button>
              <button onClick={() => handleMenuAction('ROTATE')} className="px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700">↻ Rotate 90°</button>
              <button onClick={() => setContextMenu(null)} className="px-4 py-2 text-left text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
          </div>
      )}
    </div>
  );
}