import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const LoginPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const { login, register } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password, serverPassword);
      }
      navigate('/channels/@me');
    } catch (err: any) {
      setError(err.message || 'Erro de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #2b1d42 0%, #1e243b 100%)',
    }}>
      <div style={{
        width: '480px',
        background: '#2b2d31',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        padding: '32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px', fontSize: '24px', fontWeight: 'bold' }}>
          <span style={{ marginRight: '8px' }}>🎮</span> Discord P2P
        </div>
        
        <div style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid #1e1f22' }}>
          <button
            onClick={() => setIsLogin(true)}
            style={{
              flex: 1, padding: '12px', background: 'none', border: 'none', color: isLogin ? '#fff' : '#b5bac1',
              borderBottom: isLogin ? '2px solid #5865f2' : 'none', cursor: 'pointer', fontWeight: 600
            }}
          >
            Entrar
          </button>
          <button
            onClick={() => setIsLogin(false)}
            style={{
              flex: 1, padding: '12px', background: 'none', border: 'none', color: !isLogin ? '#fff' : '#b5bac1',
              borderBottom: !isLogin ? '2px solid #5865f2' : 'none', cursor: 'pointer', fontWeight: 600
            }}
          >
            Registrar
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
              Password
            </label>
            <div style={{ display: 'flex', background: '#1e1f22', borderRadius: '4px' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  flex: 1, padding: '10px', background: 'transparent', border: 'none', color: '#fff', outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: '#b5bac1', padding: '0 10px', cursor: 'pointer' }}
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: '#b5bac1', fontWeight: 700, textTransform: 'uppercase' }}>
                Server Password <span style={{ fontWeight: 'normal', fontStyle: 'italic' }}>(Peça ao administrador)</span>
              </label>
              <input
                type="password"
                value={serverPassword}
                onChange={(e) => setServerPassword(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', background: '#1e1f22', border: 'none', borderRadius: '4px', color: '#fff', outline: 'none'
                }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: '40px', background: '#5865f2', color: '#fff', border: 'none', borderRadius: '4px',
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px', transition: 'background 0.2s'
            }}
          >
            {loading ? 'Carregando...' : (isLogin ? 'Entrar' : 'Registrar')}
          </button>

          {error && <div style={{ color: '#ed4245', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
