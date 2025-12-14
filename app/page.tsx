'use client'; 

import React, { useState } from 'react';
import { calculateGasLoad } from './gasLogic'; 
import dynamic from 'next/dynamic';

// Lazy load the designer so it doesn't crash the server
const FloorPlanDesigner = dynamic(() => import('./Components/FloorPlanDesigner'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-slate-100 animate-pulse rounded-xl"></div>
});

export default function Home() {
  const [roomType, setRoomType] = useState('ward_single_4bed');
  const [beds, setBeds] = useState('');

  const data = calculateGasLoad(roomType, beds);

  // Helper component to render a single gas card
  const GasCard = ({ label, colorTheme, gasData }: { label: string, colorTheme: string, gasData: any }) => {
    
    // Color mapping for dynamic styles
    const styles: { [key: string]: string } = {
      blue: "bg-blue-900 border-blue-500 text-white",      // Oxygen
      slate: "bg-slate-800 border-slate-500 text-white",    // Medical Air
      emerald: "bg-emerald-800 border-emerald-500 text-white", // Surgical Air
      yellow: "bg-yellow-500 border-yellow-300 text-yellow-900", // Vacuum
    };
    
    const activeStyle = styles[colorTheme] || styles.slate;

    return (
      <div className={`${activeStyle} p-6 rounded-2xl shadow-lg border-t-8 flex flex-col justify-between h-full transition-transform hover:scale-[1.02]`}>
        <div>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold uppercase text-sm opacity-90 tracking-wider">{label}</h3>
          </div>
          
          <div className="text-5xl font-black mb-2 tracking-tighter">
            {gasData.flow} <span className="text-lg font-medium opacity-60">L/min</span>
          </div>
          
          {/* Formula Display */}
          <div className="mb-6 p-2 bg-black/10 rounded text-xs font-mono opacity-80 break-words">
            {gasData.formula || "No formula applied"}
          </div>
        </div>
        
        {/* Pipe Recommendation Badge */}
        {gasData.flow > 0 ? (
          <div className="bg-white rounded-xl p-4 text-center shadow-lg transform translate-y-2">
            <span className="text-xs font-bold uppercase block text-slate-400 mb-1 tracking-widest">
              Recommended Pipe
            </span>
            <span className="font-black text-2xl text-slate-900 block tracking-tight">
              {gasData.pipe}
            </span>
          </div>
        ) : (
           <div className="bg-white/10 rounded-xl p-4 text-center border-2 border-dashed border-white/20">
            <span className="text-sm font-medium opacity-70">System Not Required</span>
           </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-6 md:p-10 font-sans text-slate-900">
      
      {/* HEADER */}
      <div className="text-center mb-12 max-w-2xl">
        <h1 className="text-5xl md:text-6xl font-black text-slate-900 mb-3 tracking-tighter">
            UbiFlow<span className="text-blue-600">AI</span>
        </h1>
        <p className="text-slate-500 text-lg md:text-xl font-medium">
            HTM 02-01 Engineering Calculator
        </p>
      </div>

      {/* INPUTS PANEL */}
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-6xl border border-slate-200 mb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* ROOM TYPE SELECTOR */}
            <div>
                <label className="block text-slate-500 font-bold mb-3 uppercase text-xs tracking-widest">
                    Clinical Department / Area
                </label>
                <div className="relative">
                    <select 
                        value={roomType}
                        onChange={(e) => setRoomType(e.target.value)}
                        className="w-full p-4 pr-10 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 text-lg font-bold shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none appearance-none cursor-pointer transition-all"
                    >
                        <optgroup label="In-Patient">
                            <option value="ward_single_4bed">General Ward (Single/4-Bed)</option>
                            <option value="ward_department">Whole Ward Department</option>
                            <option value="maternity_ldrp">Maternity (LDRP)</option>
                            <option value="neonatal">Neonatal (SCBU)</option>
                            <option value="critical_care">Critical Care (ICU/CCU/HDU)</option>
                            <option value="renal">Renal Dialysis</option>
                        </optgroup>
                        <optgroup label="Operating & Procedures">
                            <option value="operating_rooms">Operating Rooms (Theatres)</option>
                            <option value="recovery">Post-Anaesthesia Recovery</option>
                            <option value="maternity_operating">Maternity Operating Suite</option>
                            <option value="radiology">Radiology / Anaesthetic Rooms</option>
                        </optgroup>
                        <optgroup label="Emergency">
                            <option value="ae_resus">A&E Resuscitation</option>
                            <option value="ae_major_treatment">A&E Major Treatment</option>
                            <option value="ae_treatment_cubicle">A&E Cubicle</option>
                        </optgroup>
                    </select>
                    {/* Custom Arrow Icon */}
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>

            {/* BED COUNT INPUT */}
            <div>
                <label className="block text-slate-500 font-bold mb-3 uppercase text-xs tracking-widest">
                    {roomType.includes('operating') || roomType === 'maternity_operating' ? 'Number of Suites (nS)' : 'Number of Beds/Spaces (n)'}
                </label>
                <input
                    type="number"
                    value={beds}
                    onChange={(e) => setBeds(e.target.value)}
                    placeholder="Enter quantity..."
                    min="0"
                    className="w-full p-4 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 text-lg font-bold shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none placeholder:text-slate-300 transition-all"
                />
            </div>
        </div>
      </div>

      {/* RESULTS GRID */}
      {beds && parseInt(beds) > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 w-full max-w-7xl">
            <GasCard 
                label="Oxygen (O₂)" 
                colorTheme="blue" 
                gasData={data.oxygen} 
            />
            <GasCard 
                label="Medical Air (MA4)" 
                colorTheme="slate" 
                gasData={data.medicalAir} 
            />
            <GasCard 
                label="Surgical Air (SA7)" 
                colorTheme="emerald" 
                gasData={data.surgicalAir} 
            />
            <GasCard 
                label="Vacuum (Vac)" 
                colorTheme="yellow" 
                gasData={data.vacuum} 
            />
          </div>
      ) : (
          <div className="text-center py-12 px-6 rounded-3xl border-2 border-dashed border-slate-300 w-full max-w-4xl">
              <p className="text-slate-400 font-medium text-lg">
                  Please enter the number of beds or suites above to calculate HTM 02-01 loads.
              </p>
          </div>
      )}

    </div>
  );
}
