import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus,
  Search,
  Download,
  Upload,
  FileSpreadsheet,
  X,
  Clock,
  SlidersHorizontal,
  Edit2,
  Trash2,
  CheckCircle,
  TrendingUp,
  Box,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  FolderPlus,
  Image as ImageIcon,
  Database,
  FileText,
  MapPin
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, convertUSDtoVES, formatVES } from '../../../lib/currency';
import {
  fetchProductsFromSupabase,
  createProductInSupabase,
  updateProductInSupabase,
  deleteProductFromSupabase,
  updateProductStockInSupabase,
  fetchBranchesFromSupabase,
  isValidUuid,
  DbBranch,
  DbProduct
} from '../../../lib/supabase/db';

interface Product {
  sku: string;
  name: string;
  barcode: string;
  category: string;
  unit: string;
  currency: string;
  cost: number;
  price: number;
  iva: string;
  stock: number;
  minStock: number;
  status: string;
  expiry: string;
  location: string;
  branchId?: string;
  branchName?: string;
  image?: string;
}

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<DbBranch[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [newBranchId, setNewBranchId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeExchangeRate, setActiveExchangeRateState] = useState(() => getActiveExchangeRate());

  const loadProducts = async () => {
    setIsLoading(true);
    const [dbProds, dbBranches] = await Promise.all([
      fetchProductsFromSupabase(),
      fetchBranchesFromSupabase()
    ]);
    setBranches(dbBranches || []);

    const branchMap = new Map<string, string>();
    (dbBranches || []).forEach(b => {
      if (b.id) branchMap.set(b.id, b.name);
      if (b.code) branchMap.set(b.code, b.name);
    });

    const mappedProducts = (dbProds || []).map(p => {
      const bName = p.branch_id ? (branchMap.get(p.branch_id) || p.branch_id) : 'Sede Principal';
      return {
        sku: p.sku,
        name: p.name,
        barcode: p.barcode || '',
        category: p.category || 'General',
        unit: p.unit || 'UND',
        currency: 'Dólar (USD)',
        cost: Number(p.cost_usd) || 0,
        price: Number(p.price_usd) || 0,
        iva: 'General (16%)',
        stock: Number(p.stock) || 0,
        minStock: Number(p.min_stock) || 0,
        status: p.status || 'Activo',
        expiry: '—',
        location: bName,
        branchId: p.branch_id || '',
        branchName: bName,
        image: p.image_url
      };
    });
    setProducts(mappedProducts);
    setCategories(Array.from(new Set(mappedProducts.map((product) => product.category).filter(Boolean))));
    setIsLoading(false);
  };

  useEffect(() => {
    loadProducts();

    const handleRateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number }>;
      if (customEvent.detail?.rate) {
        setActiveExchangeRateState(customEvent.detail.rate);
      }
    };
    window.addEventListener('frenyer:rate-changed', handleRateChange);
    return () => window.removeEventListener('frenyer:rate-changed', handleRateChange);
  }, []);
  
  // Modals state
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [exportFilterOption, setExportFilterOption] = useState('all');
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [convertBcvBsToUsd, setConvertBcvBsToUsd] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  const handleExecuteExportModal = () => {
    let list = [...products];
    if (exportFilterOption === 'in_stock') {
      list = list.filter(p => p.stock > 0);
    } else if (exportFilterOption === 'out_of_stock') {
      list = list.filter(p => p.stock <= 0);
    } else if (exportFilterOption.startsWith('cat_')) {
      const catName = exportFilterOption.replace('cat_', '');
      list = list.filter(p => p.category === catName);
    }
    triggerExcelDownload(list, 'inventario_exportado.xlsx');
    setIsManagementOpen(false);
    showToast('Inventario exportado exitosamente.');
  };

  const handleExecuteModalImport = async () => {
    if (!selectedImportFile) return;
    setIsSubmittingImport(true);
    try {
      const data = await selectedImportFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json: any[] = XLSX.utils.sheet_to_json(worksheet);

      let count = 0;
      const rate = activeExchangeRate;

      for (const row of json) {
        const sku = String(row['SKU'] || row['sku'] || row['Código'] || row['codigo'] || '').trim()
          || `PRD-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
        const name = String(row['Nombre'] || row['nombre'] || row['Descripción'] || row['descripcion'] || '').trim();
        if (!name) {
          throw new Error('Cada fila importada debe incluir el nombre del producto.');
        }
        const category = String(row['Categoría'] || row['categoria'] || 'General');
        let cost = parseFloat(row['Costo'] || row['costo'] || 0) || 0;
        let price = parseFloat(row['Precio'] || row['precio'] || row['PVP'] || row['pvp'] || 0) || 0;
        const stock = parseInt(row['Stock'] || row['stock'] || row['Existencia'] || row['existencia'] || '0', 10) || 0;
        const barcode = String(row['Barcode'] || row['barcode'] || row['Código de barras'] || '');
        const location = String(row['Ubicación'] || row['ubicacion'] || '—');

        if (convertBcvBsToUsd && rate > 0) {
          cost = cost / rate;
          price = price / rate;
        }

        const dbProductPayload: DbProduct = {
          sku,
          name,
          barcode,
          category,
          cost_usd: Math.round(cost * 100) / 100,
          price_usd: Math.round(price * 100) / 100,
          stock,
          min_stock: 5,
          unit: 'UND',
          status: 'Activo'
        };

        const result = await createProductInSupabase(dbProductPayload);
        if (!result.success) {
          throw new Error(result.error || `No se pudo guardar el producto ${sku}.`);
        }
        count++;
      }

      showToast(`Se importaron ${count} productos correctamente.`);
      await loadProducts();
      setIsManagementOpen(false);
      setSelectedImportFile(null);
    } catch (err: any) {
      showToast('Error al importar archivo: ' + (err?.message || 'Formato no válido'), 'info');
    } finally {
      setIsSubmittingImport(false);
    }
  };

  const handleDownloadTemplate = () => {
    triggerExcelTemplateDownload('plantilla_inventario_Frenyer.xlsx');
  };
  
  // Product Creation/Edition Modal
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);

  // Dynamic Categories State
  const [categories, setCategories] = useState<string[]>([]);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  
  // Quick Stock Adjustment Modal
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('1');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct' | 'set'>('add');

  // New Product / Edit Form State matching Mockup exactly
  const [newName, setNewName] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newCategory, setNewCategory] = useState('Sin categoría');
  const [newUnit, setNewUnit] = useState('UND');
  const [newCurrency, setNewCurrency] = useState('Bolívar (VES)');
  const [newCost, setNewCost] = useState('0');
  const [newPrice, setNewPrice] = useState('0');
  const [newIva, setNewIva] = useState('General (16%)');
  const [newStock, setNewStock] = useState('0');
  const [newMinStock, setNewMinStock] = useState('0');
  const [newStatus, setNewStatus] = useState('Activo');
  const [newExpiry, setNewExpiry] = useState('');
  const [newLocation, setNewLocation] = useState('—');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Helper to resize and compress photos before saving to avoid payload limits
  const compressImageFile = (file: File, maxWidth = 400, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxWidth) {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(readerEvent.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = readerEvent.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP).', 'info');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('La imagen original excede 10 MB.', 'info');
      return;
    }

    try {
      showToast('Optimizando imagen...');
      const optimized = await compressImageFile(file, 400, 0.8);
      setImageUrl(optimized);
      showToast('Foto cargada y optimizada.');
    } catch {
      showToast('Error al procesar la imagen.', 'info');
    }
  };

  // Export filters
  const [exportCategory, setExportCategory] = useState('Todas');
  const [exportStockLevel, setExportStockLevel] = useState('Todo');

  // Notifications
  const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Dynamic Statistics
  const totalProducts = products.length;
  const totalUnities = products.reduce((sum, p) => sum + p.stock, 0);
  const totalCostValue = products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
  const totalPvpValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);

  // Filtered list for search bar and branch selector
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.branchName && p.branchName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBranch =
      selectedBranchFilter === 'all' ||
      p.branchId === selectedBranchFilter ||
      p.branchName === selectedBranchFilter;

    return matchesSearch && matchesBranch;
  });

  // Filtered list for preview & export inside Management Modal
  const previewProducts = products.filter(p => {
    const matchesCat = exportCategory === 'Todas' || p.category === exportCategory;
    const matchesStock = exportStockLevel === 'Todo' ||
      (exportStockLevel === 'Bajo' && p.stock <= 10 && p.stock > 0) ||
      (exportStockLevel === 'Agotado' && p.stock === 0);
    return matchesCat && matchesStock;
  });

  const exportProductCount = previewProducts.length;
  const exportUnities = previewProducts.reduce((sum, p) => sum + p.stock, 0);
  const exportCostVal = previewProducts.reduce((sum, p) => sum + (p.stock * p.cost), 0);
  const exportPvpVal = previewProducts.reduce((sum, p) => sum + (p.stock * p.price), 0);

  // 2. Open Product creation handle
  const handleOpenNewProduct = () => {
    setEditingSku(null);
    setNewName('');
    setNewBarcode('');
    setNewCategory('Sin categoría');
    setNewUnit('UND');
    setNewCurrency('Dólar (USD)');
    setNewCost('0');
    setNewPrice('0');
    setNewIva('General (16%)');
    setNewStock('0');
    setNewMinStock('0');
    setNewStatus('Activo');
    setNewExpiry('');
    setNewLocation('—');
    const validFirstBranch = branches.find(b => isValidUuid(b.id));
    setNewBranchId(validFirstBranch ? validFirstBranch.id! : '');
    setImageUrl(null);
    setIsNewProductOpen(true);
  };

  // 3. Open Product edition handle
  const handleEditProductClick = (p: Product) => {
    setEditingSku(p.sku);
    setNewName(p.name);
    setNewBarcode(p.barcode);
    setNewCategory(p.category);
    setNewUnit(p.unit);
    setNewCurrency(p.currency);
    setNewCost(p.cost.toString());
    setNewPrice(p.price.toString());
    setNewIva(p.iva);
    setNewStock(p.stock.toString());
    setNewMinStock(p.minStock.toString());
    setNewStatus(p.status);
    setNewExpiry(p.expiry === '—' ? '' : p.expiry);
    setNewLocation(p.location);
    setNewBranchId(isValidUuid(p.branchId) ? p.branchId! : '');
    setImageUrl(p.image || null);
    setIsNewProductOpen(true);
  };

  // 4. Save/Update product directly to Supabase
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSaving(true);
    let targetSku = editingSku;

    if (!targetSku) {
      // Generated automatically upon saving!
      const prefix = newCategory === 'Sin categoría' ? 'PRO' : newCategory.slice(0, 3).toUpperCase();
      const matches = products.filter(p => p.sku.startsWith(`${prefix}-`));
      let nextNum = 1;
      if (matches.length > 0) {
        const suffixes = matches.map(p => {
          const parts = p.sku.split('-');
          const num = parseInt(parts[1]);
          return isNaN(num) ? 0 : num;
        });
        nextNum = Math.max(...suffixes) + 1;
      }
      targetSku = `${prefix}-${nextNum.toString().padStart(4, '0')}`;
    }

    const sanitizedBranchId = isValidUuid(newBranchId) ? newBranchId : undefined;

    const payload: DbProduct = {
      sku: targetSku,
      name: newName.trim(),
      barcode: newBarcode.trim() || undefined,
      category: newCategory || 'General',
      branch_id: sanitizedBranchId,
      unit: newUnit || 'UND',
      cost_usd: parseFloat(newCost) || 0,
      price_usd: parseFloat(newPrice) || 0,
      stock: parseInt(newStock) || 0,
      min_stock: parseInt(newMinStock) || 0,
      status: newStatus,
      image_url: imageUrl || undefined
    };

    if (editingSku) {
      const res = await updateProductInSupabase(editingSku, payload);
      if (res.success) {
        showToast(`Producto ${targetSku} actualizado correctamente.`);
        await loadProducts();
        setIsNewProductOpen(false);
        setEditingSku(null);
      } else {
        showToast(`Error al actualizar: ${res.error || 'Verifica los datos'}`, 'info');
      }
    } else {
      const res = await createProductInSupabase(payload);
      if (res.success) {
        showToast(`Producto ${targetSku} guardado correctamente.`);
        await loadProducts();
        setIsNewProductOpen(false);
        setEditingSku(null);
      } else {
        showToast(`Error al guardar: ${res.error || 'Verifica los datos'}`, 'info');
      }
    }

    setIsSaving(false);
  };

  // 5. Add custom category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryInput.trim()) return;

    if (categories.some(c => c.toLowerCase() === newCategoryInput.trim().toLowerCase())) {
      showToast('Esta categoría ya existe.', 'info');
      return;
    }

    setCategories([...categories, newCategoryInput.trim()]);
    setNewCategory(newCategoryInput.trim());
    setNewCategoryInput('');
    setIsAddCategoryOpen(false);
    showToast('Categoría agregada correctamente.');
  };

  // 6. Delete Product
  const handleDeleteProduct = async (sku: string) => {
    const res = await deleteProductFromSupabase(sku);
    if (res.success) {
      showToast(`Producto ${sku} eliminado.`);
      await loadProducts();
    } else {
      showToast(`Error al eliminar: ${res.error || 'Verifica permisos'}`, 'info');
    }
  };

  // 7. Stock adjustment
  const handleSaveAdjustment = async () => {
    if (!adjustingProduct) return;
    const amount = parseInt(adjustAmount) || 0;
    let finalStock = adjustingProduct.stock;
    if (adjustType === 'add') finalStock += amount;
    else if (adjustType === 'deduct') finalStock = Math.max(0, finalStock - amount);
    else finalStock = amount;

    const ok = await updateProductStockInSupabase(adjustingProduct.sku, finalStock);
    if (ok) {
      showToast(`Stock de ${adjustingProduct.sku} actualizado a ${finalStock}.`);
      await loadProducts();
      setAdjustingProduct(null);
    } else {
      showToast('Error al actualizar stock.', 'info');
    }
  };

  // 8. Download as CSV
  const triggerCSVDownload = (itemsList: Product[], fileName: string) => {
    const headers = 'SKU,Producto,Código de barras,Categoría,Unidad,Moneda,Costo,Precio,IVA,Stock,Stock mínimo,Estado,Vencimiento,Ubicación\n';
    const rows = itemsList.map(p => 
      `"${p.sku}","${p.name}","${p.barcode}","${p.category}","${p.unit}","${p.currency}",${p.cost},${p.price},"${p.iva}",${p.stock},${p.minStock},"${p.status}","${p.expiry}","${p.location}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Archivo CSV ${fileName} descargado.`);
  };

  // Download as real Excel .xlsx
  const triggerExcelDownload = (itemsList: Product[], fileName: string) => {
    try {
      const dataForExcel = itemsList.map(p => ({
        'SKU': p.sku,
        'Producto': p.name,
        'Código de Barras': p.barcode,
        'Categoría': p.category,
        'Unidad': p.unit,
        'Moneda': p.currency,
        'Costo (USD)': p.cost,
        'Precio PVP (USD)': p.price,
        'Esquema IVA': p.iva,
        'Stock Actual': p.stock,
        'Stock Mínimo': p.minStock,
        'Estado': p.status,
        'Vencimiento': p.expiry,
        'Ubicación': p.location
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
      XLSX.writeFile(workbook, fileName);
      showToast(`Archivo Excel ${fileName} generado y descargado con éxito.`);
    } catch {
      showToast('Error al generar el archivo Excel.', 'info');
    }
  };

  // Download real multi-sheet Excel Template (.xlsx)
  const triggerExcelTemplateDownload = (fileName: string) => {
    try {
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Plantilla_Inventario
      const inventoryColumns = [
        'SKU', 'Nombre', 'Barras', 'Categoría', 'Unidad', 'Moneda', 'Costo',
        'PVP', 'IVA', 'Stock', 'Stock_Minimo', 'Estado', 'Ubicacion', 'Vencimiento'
      ];
      const wsInventory = XLSX.utils.aoa_to_sheet([inventoryColumns]);
      XLSX.utils.book_append_sheet(workbook, wsInventory, 'Plantilla_Inventario');

      // Sheet 2: Categorias_Referencia
      const catData = categories.map(c => ({ 'Categorías Registradas': c }));
      const wsCategories = XLSX.utils.json_to_sheet(catData);
      XLSX.utils.book_append_sheet(workbook, wsCategories, 'Categorias_Referencia');

      // Sheet 3: Guia_Instrucciones
      const guideData = [
        { 'Campo': 'SKU', 'Tipo': 'Texto único', 'Obligatorio': 'Sí; puede dejarse en blanco para autogenerar' },
        { 'Campo': 'Nombre', 'Tipo': 'Texto', 'Obligatorio': 'Sí' },
        { 'Campo': 'Categoría', 'Tipo': 'Texto', 'Obligatorio': 'Opcional' },
        { 'Campo': 'Unidad', 'Tipo': 'UND, KG, L, MTS, CJ, PQ, PAR', 'Obligatorio': 'Sí' },
        { 'Campo': 'Moneda', 'Tipo': 'Bolívar (VES), Dólar (USD)', 'Obligatorio': 'Sí' },
        { 'Campo': 'Costo', 'Tipo': 'Numérico (decimal)', 'Obligatorio': 'Sí' },
        { 'Campo': 'PVP', 'Tipo': 'Numérico (decimal)', 'Obligatorio': 'Sí' },
        { 'Campo': 'IVA', 'Tipo': 'General (16%), Reducido (8%), Exento (0%)', 'Obligatorio': 'Sí' },
        { 'Campo': 'Stock', 'Tipo': 'Numérico entero', 'Obligatorio': 'Sí' }
      ];
      const wsGuide = XLSX.utils.json_to_sheet(guideData);
      XLSX.utils.book_append_sheet(workbook, wsGuide, 'Guia_Instrucciones');

      XLSX.writeFile(workbook, fileName);
      showToast(`Plantilla Excel ${fileName} descargada con éxito.`);
    } catch {
      showToast('Error al generar la plantilla Excel.', 'info');
    }
  };

  return (
    <div className="content">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: toast.type === 'success' ? '#237d5f' : '#8b78e8',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1010,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <CheckCircle size={16} />
          {toast.message}
        </div>
      )}

      {/* Main Header */}
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: 24, color: 'var(--text)' }}>
            Productos e inventario
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Precios base registrados en USD ($) · Conversión automática en venta según tasa diaria
          </p>
        </div>

        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Rate indicator */}
          <div
            style={{
              background: '#e9fcf4',
              border: '1px solid #b2f1d5',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: '#136041',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ color: '#237d5f' }}>$ Tasa Activa:</span>
            <b>Bs. {activeExchangeRate.toFixed(2).replace('.', ',')}</b>
          </div>

          <Button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#fff',
              color: 'var(--text)',
              borderColor: 'var(--border)',
              fontWeight: 600
            }}
            onClick={() => {
              setIsManagementOpen(true);
            }}
          >
            <FileSpreadsheet size={16} style={{ color: '#e36f6f' }} /> Gestión de Inventario
          </Button>
          <Button variant="primary" onClick={handleOpenNewProduct}>
            <Plus size={16} /> Nuevo producto
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Card>
          <div className="kpi-label">Productos Registrados</div>
          <div className="kpi-value">{totalProducts}</div>
          <span className="muted small">Modelado de catálogo único</span>
        </Card>
        <Card>
          <div className="kpi-label">Existencias en Físico</div>
          <div className="kpi-value">{totalUnities}</div>
          <span className="muted small">Unidades consolidadas</span>
        </Card>
        <Card>
          <div className="kpi-label">Valoración Total (Costo)</div>
          <div className="kpi-value">$ {totalCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <span className="muted small" style={{ color: '#059669', fontWeight: 600 }}>
            ≈ {formatVES(convertUSDtoVES(totalCostValue, activeExchangeRate))}
          </span>
        </Card>
        <Card>
          <div className="kpi-label">Valoración Estimada (PVP)</div>
          <div className="kpi-value" style={{ color: 'var(--brand-700)' }}>$ {totalPvpValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <span className="muted small" style={{ color: '#059669', fontWeight: 600 }}>
            ≈ {formatVES(convertUSDtoVES(totalPvpValue, activeExchangeRate))}
          </span>
        </Card>
      </div>

      {/* Catalog Table Card */}
      <Card>
        <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div className="search" style={{ flex: 1, maxWidth: 440 }}>
            <Search size={16} />
            <input
              className="input"
              placeholder="Buscar SKU, nombre, código o ubicación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Sede / Almacén Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={15} style={{ color: '#0066f5' }} />
              <select
                className="input"
                style={{ height: 38, fontSize: 12, width: 190, fontWeight: 600 }}
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
              >
                <option value="all">Todas las Sedes / Almacenes</option>
                {branches.map(b => (
                  <option key={b.id || b.code} value={b.id || b.code}>
                    {b.code ? `[${b.code}] ` : ''}{b.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={loadProducts}
              title="Actualizar catálogo de productos"
              style={{
                height: 38,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: '#fff',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Sede / Almacén</th>
                <th>Vencimiento</th>
                <th className="num">Costo ($)</th>
                <th className="num">Precio ($ / Bs.)</th>
                <th>IVA</th>
                <th className="num">Stock</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Cargando productos...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <Box size={32} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      No se encontraron productos registrados.
                    </p>
                    <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
                      Haz clic en el botón superior "+ Nuevo producto" para registrar el primero en el catálogo.
                    </span>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                <tr key={p.sku}>
                  <td>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        background: '#f1f3f7',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        fontSize: 10,
                        color: '#9aa0ad'
                      }}
                    >
                      {p.image ? (
                        <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        '📦'
                      )}
                    </div>
                  </td>
                  <td><b>{p.sku}</b></td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {p.name}
                      </span>
                      {p.barcode && (
                        <span className="muted small" style={{ fontSize: 10 }}>
                          Barcode: {p.barcode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{p.category}</td>
                  <td>
                    <span
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        color: '#1d4ed8',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <MapPin size={11} style={{ color: '#2563eb' }} />
                      {p.branchName || 'Sede Principal'}
                    </span>
                  </td>
                  <td>{p.expiry}</td>
                  <td className="num">
                    <span style={{ fontWeight: 600 }}>${p.cost.toFixed(2)}</span>
                  </td>
                  <td className="num">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <b style={{ color: 'var(--text)' }}>USD {p.price.toFixed(2)}</b>
                      <span className="muted small" style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>
                        ≈ {formatVES(convertUSDtoVES(p.price, activeExchangeRate))}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Badge tone={p.iva === 'Exento' ? 'success' : 'brand'}>
                      {p.iva}
                    </Badge>
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    <span style={{ color: p.stock <= p.minStock ? 'var(--danger)' : 'inherit' }}>
                      {p.stock}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        title="Aumentar Stock"
                        onClick={() => {
                          setAdjustingProduct(p);
                          setAdjustType('add');
                          setAdjustAmount('5');
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#28a879', cursor: 'pointer', padding: 4 }}
                      >
                        <PlusCircle size={16} />
                      </button>

                      <button
                        title="Deducir Stock"
                        onClick={() => {
                          setAdjustingProduct(p);
                          setAdjustType('deduct');
                          setAdjustAmount('5');
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#e36f6f', cursor: 'pointer', padding: 4 }}
                      >
                        <MinusCircle size={16} />
                      </button>

                      <button
                        title="Ajuste manual de stock"
                        onClick={() => {
                          setAdjustingProduct(p);
                          setAdjustType('set');
                          setAdjustAmount(p.stock.toString());
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#5f6572', cursor: 'pointer', padding: 4 }}
                      >
                        <SlidersHorizontal size={14} />
                      </button>

                      <button
                        title="Editar Producto"
                        onClick={() => handleEditProductClick(p)}
                        style={{ background: 'transparent', border: 'none', color: '#8b78e8', cursor: 'pointer', padding: 4 }}
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        title="Historial de movimientos"
                        onClick={() => showToast(`Kárdex cargado para el producto: ${p.sku}`, 'info')}
                        style={{ background: 'transparent', border: 'none', color: '#9298a5', cursor: 'pointer', padding: 4 }}
                      >
                        <Clock size={14} />
                      </button>

                      <button
                        title="Eliminar del catálogo"
                        onClick={() => handleDeleteProduct(p.sku)}
                        style={{ background: 'transparent', border: 'none', color: '#e36f6f', cursor: 'pointer', padding: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )))
            }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Gestión de Inventario Modal */}
      {isManagementOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15,23,42,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#fff',
              borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
              padding: 24,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setIsManagementOpen(false);
                setSelectedImportFile(null);
              }}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <X size={18} />
            </button>

            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#f5f3ff',
                  border: '1px solid #ede9fe',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#7c3aed',
                  flexShrink: 0
                }}
              >
                <Database size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
                Gestión de Inventario
              </h3>
            </div>

            {/* EXPORTAR INVENTARIO (EXCEL) SECTION */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Exportar Inventario (Excel)
              </label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  value={exportFilterOption}
                  onChange={(e) => setExportFilterOption(e.target.value)}
                  style={{
                    flex: 1,
                    height: 40,
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '0 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0f172a',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">Todo el inventario</option>
                  <option value="in_stock">Solo productos con stock</option>
                  <option value="out_of_stock">Solo productos sin stock / agotados</option>
                  {categories.map(c => (
                    <option key={c} value={`cat_${c}`}>Categoría: {c}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleExecuteExportModal}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#7c3aed',
                    border: 'none',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                    flexShrink: 0
                  }}
                  title="Exportar archivo Excel"
                >
                  <Download size={16} style={{ color: '#40E0D0' }} />
                </button>
              </div>
            </div>

            {/* Separator */}
            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

            {/* IMPORTAR INVENTARIO (EXCEL / CSV) SECTION */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Importar Inventario (Excel / CSV)
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="file"
                  ref={modalFileInputRef}
                  style={{ display: 'none' }}
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedImportFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => modalFileInputRef.current?.click()}
                  style={{
                    height: 38,
                    padding: '0 16px',
                    borderRadius: 10,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 6px rgba(124,58,237,0.25)',
                    flexShrink: 0
                  }}
                >
                  <FileText size={14} style={{ color: '#40E0D0' }} />
                  <span>Seleccionar archivo</span>
                </button>
                <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {selectedImportFile ? selectedImportFile.name : 'Sin archivos seleccionados'}
                </span>
              </div>

              <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>
                * Compatible con exportaciones de a2 Software (Listado de Artículos / Lista de Precios).
              </span>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#0f172a', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={convertBcvBsToUsd}
                  onChange={(e) => setConvertBcvBsToUsd(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#7c3aed', cursor: 'pointer', borderRadius: 4 }}
                />
                <span>Convertir costos/precios de <b>Bs a USD</b> (Tasa BCV: Bs. {activeExchangeRate})</span>
              </label>

              {/* Action row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#7c3aed',
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Descargar plantilla Excel
                </button>

                <button
                  type="button"
                  onClick={handleExecuteModalImport}
                  disabled={!selectedImportFile || isSubmittingImport}
                  style={{
                    height: 38,
                    padding: '0 20px',
                    borderRadius: 10,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: selectedImportFile && !isSubmittingImport ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                    opacity: selectedImportFile && !isSubmittingImport ? 1 : 0.6
                  }}
                >
                  <Upload size={14} style={{ color: '#40E0D0' }} />
                  <span>{isSubmittingImport ? 'SUBIENDO...' : 'SUBIR'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de creación y edición de producto */}
      {isNewProductOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(3px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 500,
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
              background: 'white',
              maxHeight: '95vh',
              overflowY: 'auto'
            }}
          >
            {/* Header with title and X button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0a2540' }}>
                {editingSku ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsNewProductOpen(false);
                  setEditingSku(null);
                }}
                style={{ background: 'transparent', border: 'none', color: '#9aa0ad', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form layout precisely matching Image */}
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Row 1: Nombre */}
              <div className="field full">
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                  Nombre
                </label>
                <input
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre de producto"
                  required
                />
              </div>

              {/* Row 2: Código de barras & Categoría */}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Código de barras
                  </label>
                  <input
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    placeholder="Código de barras"
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Categoría
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select
                      className="input"
                      style={{ height: 38, fontSize: 13, flex: 1 }}
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    
                    {/* Permite agregar una categoría para el producto que se está creando. */}
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryOpen(true)}
                      title="Añadir Categoría"
                      style={{
                        height: 38,
                        width: 38,
                        background: '#f1f5f9',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      <FolderPlus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Notice banner for USD base pricing */}
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 11,
                  color: '#166534',
                  lineHeight: 1.4
                }}
              >
                💵 <b>Precios grabados en USD ($):</b> Todos los costos y precios se almacenan en dólares. Para ventas en Bolívares (VES), el sistema calcula automáticamente la conversión a la tasa vigente del momento (<b>Bs. {activeExchangeRate.toFixed(2)}</b>).
              </div>

              {/* Row 3: Unidad & Moneda */}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Unidad
                  </label>
                  <input
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="UND"
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Moneda Base
                  </label>
                  <input
                    className="input"
                    style={{ height: 38, fontSize: 13, background: '#f8fafc', fontWeight: 600 }}
                    value="Dólar (USD - $)"
                    disabled
                  />
                </div>
              </div>

              {/* Row 4: Costo & Precio venta */}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Costo de compra ($ USD)
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    style={{ height: 38, fontSize: 13 }}
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    placeholder="0.00"
                  />
                  <span className="muted small" style={{ color: '#059669', fontSize: 10, marginTop: 3, display: 'block' }}>
                    ≈ {formatVES(convertUSDtoVES(parseFloat(newCost) || 0, activeExchangeRate))}
                  </span>
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Precio de venta ($ USD) *
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    style={{ height: 38, fontSize: 13, fontWeight: 700 }}
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                  <span className="muted small" style={{ color: '#059669', fontSize: 10, marginTop: 3, display: 'block', fontWeight: 600 }}>
                    ≈ {formatVES(convertUSDtoVES(parseFloat(newPrice) || 0, activeExchangeRate))}
                  </span>
                </div>
              </div>

              {/* Row 5: IVA & Stock */}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    IVA
                  </label>
                  <select
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                    value={newIva}
                    onChange={(e) => setNewIva(e.target.value)}
                  >
                    <option value="General (16%)">General (16%)</option>
                    <option value="Exento">Exento (0%)</option>
                    <option value="Reducido (8%)">Reducido (8%)</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Stock
                  </label>
                  <input
                    className="input"
                    type="number"
                    style={{ height: 38, fontSize: 13 }}
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    placeholder="0"
                    disabled={!!editingSku}
                  />
                </div>
              </div>

              {/* Row 6: Stock mínimo & Estado */}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Stock mínimo
                  </label>
                  <input
                    className="input"
                    type="number"
                    style={{ height: 38, fontSize: 13 }}
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                    Estado
                  </label>
                  <select
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              {/* Row 7: Fecha de vencimiento (Opcional) */}
              <div className="field full">
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                  Fecha de vencimiento <span style={{ color: 'var(--muted)', fontWeight: 450 }}>(Opcional)</span>
                </label>
                <input
                  type="date"
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                />
                <span className="muted small" style={{ fontSize: 11, display: 'block', marginTop: 4, color: '#64748b' }}>
                  No es obligatorio registrar la fecha de vencimiento. Puedes guardar los cambios sin llenarla.
                </span>
              </div>

              {/* Row 8: Sede o Almacén */}
              <div className="field full">
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
                  Sede o Almacén
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    className="input"
                    style={{ height: 38, fontSize: 13, flex: 1, fontWeight: 500 }}
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                  >
                    <option value="">Seleccionar Sede o Almacén...</option>
                    {branches.map(b => (
                      <option key={b.id || b.code} value={isValidUuid(b.id) ? b.id : ''}>
                        {b.code ? `[${b.code}] ` : ''}{b.name} ({b.status || 'Habilitada'})
                      </option>
                    ))}
                  </select>
                </div>
                <span className="muted small" style={{ fontSize: 11, display: 'block', marginTop: 4, color: '#64748b' }}>
                  Asigna este producto a una sucursal física o almacén de inventario.
                </span>
              </div>

              {/* Row 8: Foto del producto */}
              <div className="field full" style={{ marginTop: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>
                  Foto del producto
                </label>
                
                {/* Hidden real file input */}
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleProductImageUpload}
                  style={{ display: 'none' }}
                />

                <div className="upload-slot" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    onClick={() => imageFileInputRef.current?.click()}
                    title="Haz clic para seleccionar foto desde tu equipo"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 8,
                      background: '#fafbfc',
                      border: '1px dashed var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      position: 'relative',
                      flexShrink: 0
                    }}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: '#94a3b8' }}>
                        <ImageIcon size={22} />
                        <span style={{ fontSize: 9, fontWeight: 600 }}>Examinar</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        style={{ background: '#fff', color: '#1e293b', borderColor: '#d1d5db', height: 34, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content', fontWeight: 600 }}
                        onClick={() => imageFileInputRef.current?.click()}
                      >
                        <Upload size={13} /> {imageUrl ? 'Cambiar foto' : 'Buscar en el equipo'}
                      </Button>

                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setImageUrl(null);
                            if (imageFileInputRef.current) imageFileInputRef.current.value = '';
                            showToast('Foto removida.');
                          }}
                          style={{
                            height: 34,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: '1px solid #fecaca',
                            background: '#fff',
                            color: '#ef4444',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Trash2 size={12} /> Quitar
                        </button>
                      )}
                    </div>
                    <span className="muted small" style={{ fontSize: 11, color: '#94a3b8' }}>
                      Formatos soportados: PNG, JPG, JPEG o WEBP (máx. 5 MB)
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 9: Footer Actions */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewProductOpen(false);
                    setEditingSku(null);
                  }}
                  style={{
                    height: 38,
                    padding: '0 20px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    background: 'white',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    height: 38,
                    padding: '0 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: isSaving ? '#64748b' : '#0a2540',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{editingSku ? 'Actualizar Producto' : 'Guardar Producto'}</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL: Inline Category Adder */}
      {isAddCategoryOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1100,
            padding: 16
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 360, padding: 20 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Añadir Nueva Categoría</h3>
            <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                className="input"
                placeholder="Nombre de la categoría"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                required
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <Button
                  type="button"
                  style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db', fontSize: 12 }}
                  onClick={() => setIsAddCategoryOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" style={{ fontSize: 12 }}>
                  Añadir
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ajustar Stock (Rápido) */}
      {adjustingProduct && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(3px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Ajustar Existencia: {adjustingProduct.sku}
              </h3>
              <span className="muted small" style={{ display: 'block', marginTop: 4 }}>
                {adjustingProduct.name} (Stock actual: <b>{adjustingProduct.stock}</b>)
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Tipo de Ajuste</label>
                <div style={{ display: 'flex', gap: 6, background: '#f0f1f4', padding: 4, borderRadius: 8 }}>
                  <button
                    onClick={() => setAdjustType('add')}
                    className={`config-tab-btn ${adjustType === 'add' ? 'active' : ''}`}
                    style={{ flex: 1, fontSize: 11, padding: '6px' }}
                  >
                    Aumentar
                  </button>
                  <button
                    onClick={() => setAdjustType('deduct')}
                    className={`config-tab-btn ${adjustType === 'deduct' ? 'active' : ''}`}
                    style={{ flex: 1, fontSize: 11, padding: '6px' }}
                  >
                    Deducir
                  </button>
                  <button
                    onClick={() => setAdjustType('set')}
                    className={`config-tab-btn ${adjustType === 'set' ? 'active' : ''}`}
                    style={{ flex: 1, fontSize: 11, padding: '6px' }}
                  >
                    Establecer
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Cantidad de Ajuste</label>
                <input
                  type="number"
                  className="input"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <Button
                  style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db' }}
                  onClick={() => setAdjustingProduct(null)}
                >
                  Cancelar
                </Button>
                <Button variant="primary" onClick={handleSaveAdjustment}>
                  Aplicar Ajuste
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
