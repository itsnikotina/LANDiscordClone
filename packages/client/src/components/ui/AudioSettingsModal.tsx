import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { getAudioDevices, AudioDevice } from '../../services/audio';
import { useVoiceStore } from '../../store/voiceStore';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const { inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } = useVoiceStore();
  const [devices, setDevices] = useState<{ inputs: AudioDevice[]; outputs: AudioDevice[] }>({ inputs: [], outputs: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    getAudioDevices()
      .then(setDevices)
      .catch(() => setError('Não foi possível listar os dispositivos de áudio. Verifique a permissão do microfone.'));
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurações de Áudio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>{error}</div>}

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
            Dispositivo de Entrada (Microfone)
          </label>
          <select
            value={inputDeviceId ?? ''}
            onChange={(e) => setInputDevice(e.target.value)}
            style={{ width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none' }}
          >
            <option value="">Padrão do sistema</option>
            {devices.inputs.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
            Dispositivo de Saída (Alto-falante)
          </label>
          <select
            value={outputDeviceId ?? ''}
            onChange={(e) => setOutputDevice(e.target.value)}
            style={{ width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none' }}
          >
            <option value="">Padrão do sistema</option>
            {devices.outputs.map(d => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>

        <div style={{ color: '#72767d', fontSize: '12px' }}>
          As mudanças de microfone e saída são aplicadas na hora, mesmo durante uma call.
        </div>
      </div>
    </Modal>
  );
};

export default AudioSettingsModal;
