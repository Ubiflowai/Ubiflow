'use client'; 

import React, { useState } from 'react';
import { calculateGasLoad } from './gasLogic'; // Check path matches where you put the file

export default function Home() {
  const [roomType, setRoomType] = useState('icu_standard');
  const [beds, setBeds] = useState('');

  const data = calculateGasLoad(roomType, beds);

  // Helper component to render a single gas card
  const GasCard = ({ label, colorTheme, gasData }) => {
    // Color mapping for dynamic styles
    const styles = {
      blue: "bg-blue-900 border-blue-400 text-black-100 font-bold shadow-sm",
      slate: "bg-slate-800 border-slate-400 text-black-100 font-bold shadow-sm",
      yellow: "bg-yellow-500 border-yellow-200 text-black-900 font-bold shadow-sm",
    };
    
    const activeStyle = styles[colorTheme];

    return (
      <div className={`${activeStyle} p-6 rounded-2xl shadow-lg border-l-8 flex flex-col justify-between h-full`}>
        <div>
          <h3 className="font-bold uppercase text-sm opacity-80 mb-2">{label}</h3>
          <div className="text-4xl font-extrabold mb-1">
            {gasData.flow} <span className="text-lg font-normal opacity-70">L/min</span>
          </div>
          <p className="text-xs font-medium opacity-80 italic mb-4">
            {gasData.note || "No flow required"}
          </p>
        </div>
        
        {/* Pipe Recommendation Badge */}
        {gasData.flow > 0 && (
          <div className="bg-white rounded-lg p-3 text-center shadow-md">
            
            <span className="text-xs font-bold uppercase block text-slate-400 mb-1 tracking-wider">
              Recommended Pipe
            </span>
            
            {/* THIS IS THE PART WE MADE DARKER AND BOLDER */}
            <span className="font-sans font-black text-2xl text-slate-900 block">
              {gasData.pipe}
            </span>
            
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-10 font-sans">
      
      {/* HEADER */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-extrabold text-blue-900 mb-2 tracking-tight">
            UbiFlow AI
        </h1>
        <p className="text-slate-600 text-xl font-medium">
            HTM 02-01 Table 12 Calculator
        </p>
      </div>

      {/* INPUTS */}
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-5xl border border-slate-200 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* ROOM TYPE */}
            <div>
                <label className="block text-slate-900 font-bold mb-3 uppercase text-sm tracking-wider">
                    Clinical Area
                </label>
                <select 
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full p-4 rounded-xl border-2 border-slate-300 bg-slate-50 text-slate-900 text-lg font-bold shadow-sm focus:border-blue-600 focus:ring-blue-600 outline-none cursor-pointer"
                >
                    <option value="ward">General Ward (Low Dependency)</option>
                    <option value="icu_standard">ICU - Standard (Table 12)</option>
                    <option value="icu_high_flow">ICU - High Flow / Covid</option>
                    <option value="theatre">Operating Theatre</option>
                </select>
            </div>

            {/* BED COUNT */}
            <div>
                <label className="block text-slate-900 font-bold mb-3 uppercase text-sm tracking-wider">
                    {roomType === 'theatre' ? 'Number of Theatres' : 'Number of Beds'}
                </label>
                <input
                    type="number"
                    value={beds}
                    onChange={(e) => setBeds(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full p-4 rounded-xl border-2 border-slate-300 bg-slate-50 text-slate-900 text-lg font-bold shadow-sm focus:border-blue-600 focus:ring-blue-600 outline-none placeholder:text-slate-400"
                />
            </div>
        </div>
      </div>

      {/* RESULTS GRID */}
      {beds && parseInt(beds) > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
            <GasCard label="Oxygen (O₂)" colorTheme="blue" gasData={data.oxygen} />
            <GasCard label="Medical Air (MA4)" colorTheme="slate" gasData={data.air} />
            <GasCard label="Vacuum (Vac)" colorTheme="yellow" gasData={data.vacuum} />
          </div>
      ) : (
          <div className="text-slate-400 font-medium italic mt-4">
              Enter details above to see flow rates and pipe sizing.
          </div>
      )}

    </div>
  );
}