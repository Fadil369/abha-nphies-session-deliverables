/**
 * NPHIES Claims Plugin — React Dashboard
 * BrainSAIT Innovation Lab — Glass Morphism & MeshGradient Design System
 * Bilingual: Arabic/English — IBM Plex Sans Arabic
 */

import React, { useState, useEffect } from 'react';
import { Shield, Activity, TrendingUp, Globe, AlertTriangle, CheckCircle, Clock, RefreshCw, Upload, FileSearch, Zap } from 'lucide-react';

// ─── BrainSAIT Design Tokens ──────────────────────────────────────────────────
const colors = {
  midnightBlue: '#1a365d',
  medicalBlue: '#2b6cb8',
  signalTeal: '#0ea5e9',
  successGreen: '#10b981',
  warningAmber: '#f59e0b',
  errorRed: '#ef4444',
  surfaceDark: '#0f172a',
  surfaceMid: '#1e293b',
  surfaceLight: '#334155',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
};

// ─── Type Definitions ──────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  titleAr: string;
  value: string;
  subValue?: string;
  trend?: string;
  trendPositive?: boolean;
  icon: React.ReactNode;
  accentColor?: string;
}

interface ClaimRowProps {
  claimId: string;
  invoiceNo: string;
  amount: string;
  status: 'pending' | 'validated' | 'submitted' | 'approved' | 'rejected' | 'appealed';
  rejectionCode?: string;
  branch: 'riyadh' | 'abha';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface CommandButtonProps {
  command: string;
  labelEn: string;
  labelAr: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'warning';
  onClick?: () => void;
}

interface DashboardStats {
  recoveryPotential: number;
  activeClaims: number;
  pendingAppeals: number;
  successRate: number;
  lastUpdated: string;
}

// ─── Stat Card Component ───────────────────────────────────────────────────────
const StatCard: React.FC<StatCardProps> = ({
  title,
  titleAr,
  value,
  subValue,
  trend,
  trendPositive = true,
  icon,
  accentColor = colors.signalTeal,
}) => (
  <div
    style={{
      background: `linear-gradient(135deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)`,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: `1px solid rgba(255,255,255,0.08)`,
      borderRadius: '16px',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Accent line */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
      }}
    />
    {/* Icon + value */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <p style={{ color: colors.textSecondary, fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
          {title}
        </p>
        <p style={{ color: colors.textSecondary, fontSize: '11px', marginBottom: '8px', direction: 'rtl' }}>
          {titleAr}
        </p>
        <p style={{ color: colors.textPrimary, fontSize: '28px', fontWeight: 700, lineHeight: 1 }}>
          {value}
        </p>
        {subValue && (
          <p style={{ color: colors.textSecondary, fontSize: '13px', marginTop: '4px' }}>
            {subValue}
          </p>
        )}
      </div>
      <div
        style={{
          background: `${accentColor}22`,
          borderRadius: '12px',
          padding: '10px',
          color: accentColor,
        }}
      >
        {icon}
      </div>
    </div>
    {/* Trend */}
    {trend && (
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span
          style={{
            color: trendPositive ? colors.successGreen : colors.errorRed,
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {trendPositive ? '▲' : '▼'} {trend}
        </span>
        <span style={{ color: colors.textSecondary, fontSize: '12px' }}>vs last batch</span>
      </div>
    )}
  </div>
);

// ─── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: ClaimRowProps['status'] }> = ({ status }) => {
  const config: Record<ClaimRowProps['status'], { bg: string; text: string; label: string }> = {
    pending:   { bg: '#f59e0b22', text: colors.warningAmber,  label: 'Pending'   },
    validated: { bg: '#0ea5e922', text: colors.signalTeal,    label: 'Validated' },
    submitted: { bg: '#2b6cb822', text: colors.medicalBlue,   label: 'Submitted' },
    approved:  { bg: '#10b98122', text: colors.successGreen,  label: 'Approved'  },
    rejected:  { bg: '#ef444422', text: colors.errorRed,      label: 'Rejected'  },
    appealed:  { bg: '#8b5cf622', text: '#8b5cf6',            label: 'Appealed'  },
  };
  const { bg, text, label } = config[status];
  return (
    <span
      style={{
        background: bg,
        color: text,
        borderRadius: '6px',
        padding: '2px 10px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </span>
  );
};

// ─── Priority Badge ────────────────────────────────────────────────────────────
const PriorityBadge: React.FC<{ priority: ClaimRowProps['priority'] }> = ({ priority }) => {
  const config = {
    HIGH:   { color: colors.errorRed,      dot: '●' },
    MEDIUM: { color: colors.warningAmber,  dot: '●' },
    LOW:    { color: colors.successGreen,  dot: '●' },
  };
  const { color, dot } = config[priority];
  return (
    <span style={{ color, fontSize: '12px', fontWeight: 600 }}>
      {dot} {priority}
    </span>
  );
};

// ─── Claim Row ─────────────────────────────────────────────────────────────────
const ClaimRow: React.FC<ClaimRowProps> = ({
  claimId, invoiceNo, amount, status, rejectionCode, branch, priority,
}) => (
  <tr
    style={{
      borderBottom: `1px solid rgba(255,255,255,0.05)`,
      transition: 'background 0.15s',
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
    }}
  >
    <td style={{ padding: '12px 16px', color: colors.signalTeal, fontSize: '13px', fontWeight: 600 }}>{claimId}</td>
    <td style={{ padding: '12px 16px', color: colors.textSecondary, fontSize: '13px' }}>{invoiceNo}</td>
    <td style={{ padding: '12px 16px', color: colors.textPrimary, fontSize: '13px', fontWeight: 600 }}>SAR {amount}</td>
    <td style={{ padding: '12px 16px' }}><StatusBadge status={status} /></td>
    <td style={{ padding: '12px 16px', color: colors.warningAmber, fontSize: '13px' }}>{rejectionCode ?? '—'}</td>
    <td style={{ padding: '12px 16px' }}><PriorityBadge priority={priority} /></td>
    <td style={{ padding: '12px 16px', color: colors.textSecondary, fontSize: '12px', textTransform: 'capitalize' }}>{branch}</td>
  </tr>
);

// ─── Command Button ────────────────────────────────────────────────────────────
const CommandButton: React.FC<CommandButtonProps> = ({
  command, labelEn, labelAr, icon, variant = 'secondary', onClick,
}) => {
  const variantStyles = {
    primary:   { bg: colors.medicalBlue,  border: colors.medicalBlue,  hover: '#1d4e8f' },
    secondary: { bg: 'transparent',       border: colors.surfaceLight,  hover: colors.surfaceMid },
    warning:   { bg: 'transparent',       border: colors.warningAmber,  hover: '#78350f22' },
  };
  const { bg, border } = variantStyles[variant];
  return (
    <button
      onClick={onClick}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '10px',
        padding: '12px 16px',
        color: colors.textPrimary,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ color: colors.signalTeal }}>{icon}</span>
      <div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
          {command}
        </p>
        <p style={{ fontSize: '11px', color: colors.textSecondary, margin: 0 }}>{labelEn}</p>
        <p style={{ fontSize: '11px', color: colors.textSecondary, margin: 0, direction: 'rtl' }}>
          {labelAr}
        </p>
      </div>
    </button>
  );
};

// ─── Branch Portal Registry ────────────────────────────────────────────────────
const BRANCH_REGISTRY = [
  { key: 'abha',    label: 'Hayat – ABHA',    host: '172.19.1.1',    basePath: '/Oasis', protocol: 'http'  },
  { key: 'riyadh',  label: 'Al-Hayat – Riyadh', host: '128.1.1.185', basePath: '/prod',  protocol: 'https' },
  { key: 'madinah', label: 'Madinah',          host: '172.25.11.26',  basePath: '/Oasis', protocol: 'http'  },
  { key: 'unaizah', label: 'Unaizah',          host: '10.0.100.105',  basePath: '/prod',  protocol: 'http'  },
  { key: 'khamis',  label: 'Khamis',           host: '172.30.0.77',   basePath: '/prod',  protocol: 'http'  },
  { key: 'jizan',   label: 'Jizan',            host: '172.17.4.84',   basePath: '/prod',  protocol: 'http'  },
] as const;

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const mockClaims: ClaimRowProps[] = [
  { claimId: 'CLM-001', invoiceNo: 'INV73228', amount: '5,200', status: 'validated', rejectionCode: 'BE-1-4', branch: 'riyadh', priority: 'HIGH' },
  { claimId: 'CLM-002', invoiceNo: 'INV73222', amount: '3,800', status: 'appealed',  rejectionCode: 'BE-1-4', branch: 'riyadh', priority: 'HIGH' },
  { claimId: 'CLM-003', invoiceNo: 'INV73167', amount: '1,400', status: 'submitted', rejectionCode: 'MN-1-1', branch: 'abha',   priority: 'MEDIUM' },
  { claimId: 'CLM-004', invoiceNo: 'INV73266', amount: '6,100', status: 'pending',   rejectionCode: 'BE-1-4', branch: 'riyadh', priority: 'HIGH' },
  { claimId: 'CLM-005', invoiceNo: 'INV73249', amount: '2,750', status: 'approved',  rejectionCode: 'BE-3-1', branch: 'abha',   priority: 'MEDIUM' },
];

const mockStats: DashboardStats = {
  recoveryPotential: 102601,
  activeClaims: 142,
  pendingAppeals: 43,
  successRate: 95,
  lastUpdated: new Date().toLocaleTimeString(),
};

// ─── Main Dashboard Component ──────────────────────────────────────────────────
const NphiesDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>(mockStats);
  const [activeTab, setActiveTab] = useState<'claims' | 'batch' | 'appeals'>('claims');
  const [isHydrating, setIsHydrating] = useState(false);
  const [complianceStatus] = useState<'NPHIES-SA' | 'HIPAA' | 'FHIR-R4'>('NPHIES-SA');

  // Simulate live refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        ...prev,
        lastUpdated: new Date().toLocaleTimeString(),
      }));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleHydrate = () => {
    setIsHydrating(true);
    setTimeout(() => setIsHydrating(false), 2000);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.surfaceDark,
        color: colors.textPrimary,
        fontFamily: "'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* MeshGradient Background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 50% at 20% 20%, ${colors.midnightBlue}44 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, ${colors.medicalBlue}33 0%, transparent 50%),
            radial-gradient(ellipse 70% 60% at 50% 50%, ${colors.signalTeal}11 0%, transparent 70%)
          `,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid rgba(255,255,255,0.08)`,
            paddingBottom: '20px',
            marginBottom: '32px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <div
                style={{
                  background: `linear-gradient(135deg, ${colors.midnightBlue}, ${colors.medicalBlue})`,
                  borderRadius: '10px',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Shield size={20} color={colors.signalTeal} />
              </div>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: colors.textPrimary }}>
                  NPHIES Automation Portal
                </h1>
                <p style={{ fontSize: '13px', color: colors.textSecondary, margin: 0, direction: 'rtl' }}>
                  بوابة أتمتة مطالبات نفيث
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Compliance Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: `${colors.successGreen}22`,
                border: `1px solid ${colors.successGreen}44`,
                borderRadius: '20px',
                padding: '6px 14px',
              }}
            >
              <CheckCircle size={14} color={colors.successGreen} />
              <span style={{ fontSize: '12px', color: colors.successGreen, fontWeight: 600 }}>
                {complianceStatus}
              </span>
            </div>

            {/* Version */}
            <span
              style={{
                background: `${colors.medicalBlue}22`,
                border: `1px solid ${colors.medicalBlue}44`,
                borderRadius: '20px',
                padding: '6px 14px',
                fontSize: '12px',
                color: colors.medicalBlue,
              }}
            >
              v1.1.0-STABLE
            </span>

            {/* Language indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.textSecondary }}>
              <Globe size={16} />
              <span style={{ fontSize: '12px' }}>EN / عربي</span>
            </div>
          </div>
        </header>

        {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            marginBottom: '32px',
          }}
        >
          <StatCard
            title="Recovery Potential"
            titleAr="إمكانية الاسترداد"
            value={`SAR ${stats.recoveryPotential.toLocaleString()}`}
            subValue="BE-1-4 + MN-1-1 combined"
            trend="+12%"
            trendPositive
            icon={<TrendingUp size={20} />}
            accentColor={colors.signalTeal}
          />
          <StatCard
            title="Active Claims"
            titleAr="المطالبات النشطة"
            value={stats.activeClaims.toString()}
            subValue="Riyadh + ABHA branches"
            trend="5 new"
            trendPositive
            icon={<Activity size={20} />}
            accentColor={colors.medicalBlue}
          />
          <StatCard
            title="Pending Appeals"
            titleAr="الاستئنافات المعلقة"
            value={stats.pendingAppeals.toString()}
            subValue="43 BE-1-4 • 31 MN-1-1"
            icon={<AlertTriangle size={20} />}
            accentColor={colors.warningAmber}
          />
          <StatCard
            title="Success Rate"
            titleAr="معدل النجاح"
            value={`${stats.successRate}%`}
            subValue="Last 30 days (3 dry-runs min)"
            trend="+3%"
            trendPositive
            icon={<CheckCircle size={20} />}
            accentColor={colors.successGreen}
          />
        </div>

        {/* ── Main Content Layout ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>

          {/* Left: Claims Table */}
          <div
            style={{
              background: `linear-gradient(135deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.9) 100%)`,
              backdropFilter: 'blur(12px)',
              border: `1px solid rgba(255,255,255,0.08)`,
              borderRadius: '16px',
              overflow: 'hidden',
            }}
          >
            {/* Table Tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: `1px solid rgba(255,255,255,0.08)`,
                padding: '0 16px',
              }}
            >
              {(['claims', 'batch', 'appeals'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: activeTab === tab ? colors.signalTeal : colors.textSecondary,
                    borderBottom: activeTab === tab ? `2px solid ${colors.signalTeal}` : '2px solid transparent',
                    padding: '16px 20px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: activeTab === tab ? 600 : 400,
                    textTransform: 'capitalize',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab === 'claims' ? 'Claims Queue | قائمة المطالبات' :
                   tab === 'batch' ? 'Batch Status | حالة الدفعة' :
                   'Appeals | الاستئنافات'}
                </button>
              ))}
            </div>

            {/* Table Content */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
                    {['Claim ID', 'Invoice', 'Amount', 'Status', 'Rej. Code', 'Priority', 'Branch'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '12px 16px',
                          color: colors.textSecondary,
                          fontSize: '11px',
                          fontWeight: 600,
                          textAlign: 'left',
                          letterSpacing: '0.8px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockClaims.map((claim) => (
                    <ClaimRow key={claim.claimId} {...claim} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: `1px solid rgba(255,255,255,0.05)`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: colors.textSecondary, fontSize: '12px' }}>
                Showing 5 of {stats.activeClaims} claims
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.textSecondary, fontSize: '12px' }}>
                <Clock size={12} />
                Last updated: {stats.lastUpdated}
              </div>
            </div>
          </div>

          {/* Right: Command Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Quick Commands */}
            <div
              style={{
                background: `linear-gradient(135deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.9) 100%)`,
                backdropFilter: 'blur(12px)',
                border: `1px solid rgba(255,255,255,0.08)`,
                borderRadius: '16px',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, marginBottom: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Operator Commands | أوامر المشغل
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <CommandButton
                  command="/nphies-validate"
                  labelEn="Quick claim format check"
                  labelAr="فحص تنسيق المطالبة"
                  icon={<FileSearch size={16} />}
                  variant="secondary"
                />
                <CommandButton
                  command="/nphies-submit"
                  labelEn="Submit batch (dry-run)"
                  labelAr="تقديم الدفعة (محاكاة)"
                  icon={<Upload size={16} />}
                  variant="primary"
                />
                <CommandButton
                  command="/nphies-appeal"
                  labelEn="Analyze rejection & appeal"
                  labelAr="تحليل الرفض والاستئناف"
                  icon={<AlertTriangle size={16} />}
                  variant="secondary"
                />
                <CommandButton
                  command="/nphies-batch"
                  labelEn="Run batch from CSV"
                  labelAr="تشغيل الدفعة من CSV"
                  icon={<Activity size={16} />}
                  variant="secondary"
                />
                <CommandButton
                  command="/nphies-status"
                  labelEn="Show progress & audit trail"
                  labelAr="عرض التقدم والمراجعة"
                  icon={<Clock size={16} />}
                  variant="secondary"
                />
                <CommandButton
                  command="/nphies-hydrate"
                  labelEn="Refresh approval limits"
                  labelAr="تحديث حدود الموافقة"
                  icon={<RefreshCw size={16} className={isHydrating ? 'spin' : ''} />}
                  variant="warning"
                  onClick={handleHydrate}
                />
              </div>
            </div>

            {/* Safety Status */}
            <div
              style={{
                background: `linear-gradient(135deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.9) 100%)`,
                backdropFilter: 'blur(12px)',
                border: `1px solid rgba(255,255,255,0.08)`,
                borderRadius: '16px',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, marginBottom: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Safety Guardrails | ضمانات الأمان
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Dry-Run Enforcement', labelAr: 'تطبيق المحاكاة', active: true },
                  { label: '3-Run Gate (0/3 done)', labelAr: 'بوابة 3 محاكاة', active: false },
                  { label: 'HIPAA Audit Logging', labelAr: 'سجل مراجعة HIPAA', active: true },
                  { label: 'Approval Limit Guard', labelAr: 'حارس حدود الموافقة', active: true },
                  { label: 'FHIR R4 Compliance', labelAr: 'امتثال FHIR R4', active: true },
                ].map(({ label, labelAr, active }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '12px', color: colors.textPrimary, margin: 0 }}>{label}</p>
                      <p style={{ fontSize: '10px', color: colors.textSecondary, margin: 0, direction: 'rtl' }}>{labelAr}</p>
                    </div>
                    <span style={{ color: active ? colors.successGreen : colors.warningAmber, fontSize: '14px' }}>
                      {active ? '✓' : '○'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Agents Panel */}
            <div
              style={{
                background: `linear-gradient(135deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.9) 100%)`,
                backdropFilter: 'blur(12px)',
                border: `1px solid rgba(255,255,255,0.08)`,
                borderRadius: '16px',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, marginBottom: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Active Agents | الوكلاء النشطون
              </h3>
              {[
                { name: '@submissions-manager', desc: 'Orchestrates claim lifecycle', descAr: 'يدير دورة حياة المطالبة', status: 'online' as const },
                { name: '@appeals-processor',   desc: 'SAR 102,601+ recovery focus', descAr: 'استرداد SAR 102,601+',   status: 'online' as const },
              ].map(({ name, desc, descAr, status }) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    marginBottom: '8px',
                    border: `1px solid rgba(255,255,255,0.04)`,
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: status === 'online' ? colors.successGreen : colors.warningAmber,
                      boxShadow: `0 0 6px ${status === 'online' ? colors.successGreen : colors.warningAmber}`,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p style={{ fontSize: '12px', color: colors.signalTeal, fontWeight: 600, margin: 0 }}>{name}</p>
                    <p style={{ fontSize: '11px', color: colors.textSecondary, margin: 0 }}>{desc}</p>
                    <p style={{ fontSize: '10px', color: colors.textSecondary, margin: 0, direction: 'rtl' }}>{descAr}</p>
                  </div>
                  <Zap size={12} color={colors.signalTeal} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NphiesDashboard;
