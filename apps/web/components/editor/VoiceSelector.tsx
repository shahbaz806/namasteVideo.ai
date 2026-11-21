'use client';

import React from 'react';

export interface VoiceOption {
  preset: string;
  label: string;
  accent: string;
  testOnly: boolean;
  sampleAssetId: string | null;
}

export function VoiceSelector({
  voices,
  selectedPreset,
  onChange,
  disabled = false,
}: {
  voices: VoiceOption[];
  selectedPreset: string;
  onChange: (preset: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {voices.map((v) => {
          const isSelected = v.preset === selectedPreset;
          return (
            <div
              key={v.preset}
              onClick={() => !disabled && onChange(v.preset)}
              style={{
                padding: '16px',
                borderRadius: 'var(--radius)',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isSelected ? 'rgba(229,140,51,0.08)' : 'var(--canvas)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'border-color .16s ease, background .16s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                  {v.label}
                </span>
                {v.testOnly && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: '#252525',
                      color: 'var(--muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Test Voice
                  </span>
                )}
              </div>
              <span className="hint" style={{ margin: 0 }}>
                {v.accent} · 24kHz studio synthesis
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
