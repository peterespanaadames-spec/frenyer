import { useState, useCallback } from 'react';
import { ChevronDown, Building2, Circle, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserOrganization } from '../../context/AuthContext';

export function OrganizationSelector() {
  const { activeOrganizationId, userOrganizations, setActiveOrganization } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const activeOrg = userOrganizations.find((o: UserOrganization) => o.isActive) ||
    userOrganizations.find((o: UserOrganization) => o.id === activeOrganizationId) ||
    userOrganizations[0];

  const handleSelect = useCallback(
    (orgId: string) => {
      setActiveOrganization(orgId).catch(() => {});
      setIsOpen(false);
    },
    [setActiveOrganization]
  );

  if (userOrganizations.length === 0) return null;

  return (
    <div className="org-selector">
      {/* Selector de organización activa. Se muestra siempre que el usuario tenga al menos una organización. */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Cambiar de organización"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          border: '1px solid var(--border, #cbd5e1)',
          borderRadius: 8,
          background: '#ffffff',
          color: '#111827',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          minHeight: 36
        }}
      >
        <Building2 size={16} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
          {activeOrg?.name || 'Organización'}
        </span>
        <ChevronDown size={14} style={{ marginLeft: 4 }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            minWidth: 220,
            background: '#ffffff',
            border: '1px solid var(--border, #cbd5e1)',
            borderRadius: 8,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
            marginTop: 4
          }}
          role="menu"
        >
          {userOrganizations.map((org: UserOrganization) => (
            <button
              key={org.id}
              type="button"
              role="menuitem"
              onClick={() => handleSelect(org.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                background: org.isActive ? '#eef2ff' : '#ffffff',
                color: '#111827',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              {org.isActive && (
                <Check size={16} style={{ color: '#4f46e5' }} />
              )}
              {!org.isActive && (
                <Circle size={10} style={{ fill: '#cbd5e1' }} />
              )}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {org.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: '#e5e7eb',
                  color: '#374151',
                  marginLeft: 'auto'
                }}
              >
                {org.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}