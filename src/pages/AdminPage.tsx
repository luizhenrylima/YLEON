import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, ImageIcon, ChevronLeft, Pencil, Save, Check, Search, Star, Sparkles, Tag, Home, Users, UserCheck, UserX, Clock, Palette, Link, Loader2, Eye, EyeOff } from 'lucide-react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { uploadToStorage } from '@/lib/storage';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableImageSlot } from '@/components/SortableImageSlot';
import PriceMarkupTools from '@/components/PriceMarkupTools';
import { PriceImportTools } from '@/pages/PriceImportPage';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
  setLocalBrandHidden,
  setLocalProductHidden,
} from '@/lib/catalogVisibility';

type Brand = Tables<'brands'> & { is_hidden?: boolean | null };
type Product = Tables<'products'> & { ambient_images?: string[] | null; is_hidden?: boolean | null };
type Category = Tables<'categories'>;
type AdminAssignableRole = 'ceo' | 'gestor' | 'financeiro' | 'vendedor' | 'arquiteto';

const ADMIN_ROLE_OPTIONS: { value: AdminAssignableRole; label: string; description: string }[] = [
  { value: 'arquiteto', label: 'Arquiteto', description: 'Catalogo, favoritos e projetos proprios.' },
  { value: 'vendedor', label: 'Vendedor', description: 'Rotina, carteira e projetos vinculados.' },
  { value: 'gestor', label: 'Gerente', description: 'Gestao operacional e rotina geral.' },
  { value: 'ceo', label: 'CEO', description: 'Operacao completa, sem acesso ao Admin.' },
  { value: 'financeiro', label: 'Financeiro', description: 'Perfil preparado para modulo financeiro.' },
];

interface BrandCategory {
  brand_id: string;
  category_id: string;
}

interface Designer {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  display_order: number;
}

interface LandingImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
}

interface StyleTag {
  id: string;
  name: string;
}

interface ProductStyleTag {
  product_id: string;
  style_tag_id: string;
}

interface FeaturedProduct {
  id: string;
  product_id: string;
  display_order: number;
}

interface EnvironmentItem {
  id: string;
  name: string;
  icon: string;
}

interface ProductEnvironment {
  product_id: string;
  environment_id: string;
}

interface ProductCompositionSuggestion {
  product_id: string;
  suggested_product_id: string;
  display_order: number;
}

interface CuratedCollection {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  display_order: number;
  is_active: boolean;
}

interface CuratedCollectionProduct {
  collection_id: string;
  product_id: string;
  display_order: number;
}

interface BulkImportProductResult {
  name: string;
  url: string;
  action?: 'created' | 'updated';
  imageCount: number;
  ambientImageCount?: number;
  styleCount?: number;
  environmentCount?: number;
  environmentNames?: string[];
  categoryName?: string;
  downloads: {
    techSheet: boolean;
    file2d: boolean;
    threeDCount: number;
  };
  warnings: string[];
  error?: string;
}

interface BulkImportProductLink {
  url: string;
  nameFromCard: string;
  imageFromCard: string | null;
}

interface BulkImportSummary {
  success: boolean;
  category: string;
  found: number;
  batchFound?: number;
  startIndex?: number;
  nextStartIndex?: number;
  hasMore?: boolean;
  created: number;
  updated: number;
  failed: number;
  productsWithoutFiveImages: number;
  productsWithout2d: number;
  productsWithout3d: number;
  products: BulkImportProductResult[];
  productLinks?: BulkImportProductLink[];
  sourceRateLimited?: boolean;
  retryAfterMs?: number;
  message?: string;
}

interface FinishImportCategoryResult {
  name: string;
  finishGroup: string;
  found: number;
  created: number;
  updated: number;
  failed: number;
  errors?: string[];
}

async function invokeAdminEdgeFunction<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('Sessao expirada. Entre novamente para continuar.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || text || `Edge Function retornou HTTP ${response.status}`);
  }

  return payload as T;
}

const normalizeBrandLookup = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const findBrandByLooseName = (brands: Brand[], candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeBrandLookup);
  return brands.find(brand => {
    const normalizedName = normalizeBrandLookup(brand.name);
    return normalizedCandidates.some(candidate => normalizedName === candidate || normalizedName.includes(candidate));
  });
};

const inferKnownBrandNameFromImportUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname;
    if (host.includes('americamoveis')) return 'America Moveis';
    if (host.includes('meucentury') || host.includes('centurybrazil')) return 'Century';
    if (host.includes('essenzamoveis')) return 'Essenza';
    if (host.includes('folioliving')) return 'Folio';
    if (host.includes('tissot')) return 'Tissot';
    if (host.includes('doimobrasil')) return 'Doimo';
    if (host.includes('casoca') && /\/cgs(?:\.html|\/|$)/i.test(path)) return 'CGS';
    if (host.includes('casoca') && /\/grupo-bellarte(?:\.html|\/|$)/i.test(path)) return "Bell'Arte";
    if (host.includes('greenhousemoveis')) return 'Green House';
    if (host.includes('feelingestofados')) return 'Feeling';
    if (host.includes('neoboxmoveis')) return 'Neobox';
    if (host.includes('pontovirgula')) return 'Ponto Vírgula';
  } catch {
    return '';
  }
  return '';
};

interface FinishImportSummary {
  success: boolean;
  brandName: string;
  sourceUrl: string;
  categoriesFound: number;
  finishesFound: number;
  categoriesCreated: number;
  categoriesExisting: number;
  finishesCreated: number;
  finishesUpdated: number;
  failed: number;
  categories: FinishImportCategoryResult[];
  error?: string;
}

const PRODUCT_IMAGE_LIMIT = 5;
const AMBIENT_IMAGE_LIMIT = 3;
const ADMIN_BRAND_FIELDS = 'id, name, logo_url, segment, created_at, is_hidden';
const ADMIN_PRODUCT_FIELDS = 'id, name, images, ambient_images, brand_id, category, description, file_3d, file_2d, tech_sheet, finish_link, designer_id, created_at, is_hidden';
const ADMIN_CATEGORY_FIELDS = 'id, name, created_at';
const ADMIN_FEATURED_DESIGNER_FIELDS = 'id, name, description, photo_url, display_order';
const ADMIN_LANDING_IMAGE_FIELDS = 'id, image_url, alt_text, display_order';
const ADMIN_STYLE_TAG_FIELDS = 'id, name';
const ADMIN_FEATURED_PRODUCT_FIELDS = 'id, product_id, display_order';
const ADMIN_ENVIRONMENT_FIELDS = 'id, name, icon';
const ADMIN_PROFILE_FIELDS = 'id, user_id, full_name, approved, seller_id, birth_date, phone, email, office_name, is_active, created_at';
const ADMIN_USER_ROLE_FIELDS = 'id, user_id, role';
const ADMIN_FINISH_CATEGORY_FIELDS = 'id, brand_id, name, display_order, finish_group';
const ADMIN_FINISH_FIELDS = 'id, finish_category_id, name, image_url, display_order';
const ADMIN_PRODUCT_DESIGNER_FIELDS = 'id, name, bio, photo_url, created_at';

function splitProductImages(images: string[] | null | undefined, ambientImages?: string[] | null) {
  const safeImages = images ?? [];
  const safeAmbientImages = ambientImages ?? [];
  return {
    productImages: safeImages.slice(0, PRODUCT_IMAGE_LIMIT),
    ambientImages: (safeAmbientImages.length > 0 ? safeAmbientImages : safeImages.slice(PRODUCT_IMAGE_LIMIT)).slice(0, AMBIENT_IMAGE_LIMIT),
  };
}

function cleanProductDescription(value: string | null | undefined) {
  return (value || '')
    .replace(/\bvisite\s+a\s+p[aá]gina(?:\s+e\s+conhe[cç]a)?!?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

async function getFunctionErrorMessage(error: any, fallback: string) {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    const cloned = response.clone();
    const payload = await cloned.json().catch(() => null);
    if (payload?.error) return payload.error;
    if (payload?.message) return payload.message;
  }
  return error?.message || fallback;
}

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandCategories, setBrandCategories] = useState<BrandCategory[]>([]);
  const [newCategory, setNewCategory] = useState('');

  const [newBrand, setNewBrand] = useState({ name: '', logo: '', segment: 'high' });
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);
  const [selectedBrandCategories, setSelectedBrandCategories] = useState<string[]>([]);

  const emptyProduct = {
    name: '', images: [] as string[], brandId: '', category: '',
    ambientImages: [] as string[],
    description: '', file3d: '', file2d: '', techSheet: '', finishLink: '',
    designerId: '' as string,
  };
  const [newProduct, setNewProduct] = useState(emptyProduct);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [centuryCategoryUrl, setCenturyCategoryUrl] = useState('https://meucentury.com/produtos/mesas-de-cabeceira/');
  const [bulkImportBrandId, setBulkImportBrandId] = useState('');
  const [bulkImportBrandName, setBulkImportBrandName] = useState('');
  const [selectedBulkCategoryId, setSelectedBulkCategoryId] = useState('');
  const [selectedBulkEnvironmentIds, setSelectedBulkEnvironmentIds] = useState<string[]>([]);
  const [isBulkImportingCentury, setIsBulkImportingCentury] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState<BulkImportSummary | null>(null);

  useEffect(() => {
    if (bulkImportBrandId || brands.length === 0) return;
    const century = brands.find(brand => brand.name.toLowerCase() === 'century');
    setBulkImportBrandId((century || brands[0]).id);
  }, [brands, bulkImportBrandId]);

  // Style tags
  const [styleTags, setStyleTags] = useState<StyleTag[]>([]);
  const [productStyleTags, setProductStyleTags] = useState<ProductStyleTag[]>([]);
  const [selectedProductStyles, setSelectedProductStyles] = useState<string[]>([]);
  const [newStyleTag, setNewStyleTag] = useState('');

  // Featured products
  const [featuredProducts, setFeaturedProducts] = useState<FeaturedProduct[]>([]);

  // Environments
  const [environmentsList, setEnvironmentsList] = useState<EnvironmentItem[]>([]);
  const [productEnvironments, setProductEnvironments] = useState<ProductEnvironment[]>([]);
  const [selectedProductEnvs, setSelectedProductEnvs] = useState<string[]>([]);
  const [productCompositionSuggestions, setProductCompositionSuggestions] = useState<ProductCompositionSuggestion[]>([]);
  const [selectedCompositionProductIds, setSelectedCompositionProductIds] = useState<string[]>([]);
  const [compositionProductSearch, setCompositionProductSearch] = useState('');

  const emptyCuratedCollection = { title: '', description: '', coverImage: '', displayOrder: 0, isActive: true };
  const [curatedCollections, setCuratedCollections] = useState<CuratedCollection[]>([]);
  const [curatedCollectionProducts, setCuratedCollectionProducts] = useState<CuratedCollectionProduct[]>([]);
  const [newCuratedCollection, setNewCuratedCollection] = useState(emptyCuratedCollection);
  const [editingCuratedCollectionId, setEditingCuratedCollectionId] = useState<string | null>(null);
  const [selectedCuratedProductIds, setSelectedCuratedProductIds] = useState<string[]>([]);
  const [curatedProductSearch, setCuratedProductSearch] = useState('');

  // Featured Designers state
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [editingDesigner, setEditingDesigner] = useState<{ name: string; description: string; photo_url: string; id?: string }>({ name: '', description: '', photo_url: '' });
  const [editingDesignerId, setEditingDesignerId] = useState<string | null>(null);

  // Product Designers (assina a peça)
  interface ProductDesigner { id: string; name: string; bio: string | null; photo_url: string | null; created_at: string; }
  const [productDesigners, setProductDesigners] = useState<ProductDesigner[]>([]);
  const [editingPDesigner, setEditingPDesigner] = useState<{ name: string; bio: string; photo_url: string }>({ name: '', bio: '', photo_url: '' });
  const [editingPDesignerId, setEditingPDesignerId] = useState<string | null>(null);

  // Landing Images state
  const [landingImages, setLandingImages] = useState<LandingImage[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newEnvironmentName, setNewEnvironmentName] = useState('');

  // Finishes state
  interface FinishCategory { id: string; brand_id: string; name: string; display_order: number; finish_group: string; }
  interface FinishItem { id: string; finish_category_id: string; name: string; image_url: string; display_order: number; }
  const [finishCategories, setFinishCategories] = useState<FinishCategory[]>([]);
  const [finishItems, setFinishItems] = useState<FinishItem[]>([]);
  const [selectedFinishBrand, setSelectedFinishBrand] = useState<string>('');
  const [newFinishCategoryName, setNewFinishCategoryName] = useState('');
  const [newFinishGroup, setNewFinishGroup] = useState<string>('Superfícies e Pinturas');
  const [selectedFinishCategory, setSelectedFinishCategory] = useState<string>('');
  const [centuryFinishUrl, setCenturyFinishUrl] = useState('');
  const [isImportingCenturyFinishes, setIsImportingCenturyFinishes] = useState(false);
  const [finishImportSummary, setFinishImportSummary] = useState<FinishImportSummary | null>(null);

  // User management
  interface UserProfile {
    id: string;
    user_id: string;
    full_name: string | null;
    approved: boolean;
    seller_id: string | null;
    birth_date: string | null;
    phone?: string | null;
    email?: string | null;
    office_name?: string | null;
    is_active?: boolean | null;
    created_at: string;
  }
  interface UserRole {
    id: string;
    user_id: string;
    role: 'admin' | 'user' | AdminAssignableRole;
  }
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newSeller, setNewSeller] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'arquiteto' as AdminAssignableRole,
    phone: '',
    officeName: '',
    sellerId: '',
    active: true,
  });
  const [isCreatingSeller, setIsCreatingSeller] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      brands.find(b => b.id === p.brand_id)?.name.toLowerCase().includes(q)
    );
  }, [products, productSearch, brands]);

  const selectedCompositionProducts = useMemo(() => {
    const productMap = new Map(products.map(product => [product.id, product]));
    return selectedCompositionProductIds
      .map(id => productMap.get(id))
      .filter((product): product is Product => Boolean(product));
  }, [products, selectedCompositionProductIds]);

  const compositionProductOptions = useMemo(() => {
    const q = compositionProductSearch.trim().toLowerCase();
    if (!q) return [];

    return products
      .filter(product => product.id !== editingProductId)
      .filter(product => !selectedCompositionProductIds.includes(product.id))
      .filter(product => {
        const brandName = brands.find(brand => brand.id === product.brand_id)?.name || '';
        return (
          product.name.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q) ||
          brandName.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [brands, compositionProductSearch, editingProductId, products, selectedCompositionProductIds]);

  const selectedCuratedProducts = useMemo(() => {
    const productMap = new Map(products.map(product => [product.id, product]));
    return selectedCuratedProductIds
      .map(id => productMap.get(id))
      .filter((product): product is Product => Boolean(product));
  }, [products, selectedCuratedProductIds]);

  const curatedProductOptions = useMemo(() => {
    const q = curatedProductSearch.trim().toLowerCase();
    if (!q) return [];

    return products
      .filter(product => !selectedCuratedProductIds.includes(product.id))
      .filter(product => {
        const brandName = brands.find(brand => brand.id === product.brand_id)?.name || '';
        return (
          product.name.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q) ||
          brandName.toLowerCase().includes(q)
        );
      })
      .slice(0, 10);
  }, [brands, curatedProductSearch, products, selectedCuratedProductIds]);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) { navigate('/'); return; }
    const fetchAll = async () => {
      const [b, p, c, bc, d, li, st, pst, fp, envs, pe, pcs, cc, ccp, profiles, roles, fCats, fItems, pfc, pd] = await Promise.all([
        supabase.from('brands').select(ADMIN_BRAND_FIELDS).order('name'),
        supabase.from('products').select(ADMIN_PRODUCT_FIELDS).order('created_at', { ascending: false }),
        supabase.from('categories').select(ADMIN_CATEGORY_FIELDS).order('name'),
        supabase.from('brand_categories').select('brand_id, category_id'),
        supabase.from('featured_designers').select(ADMIN_FEATURED_DESIGNER_FIELDS).order('display_order'),
        supabase.from('landing_images').select(ADMIN_LANDING_IMAGE_FIELDS).order('display_order'),
        supabase.from('design_style_tags').select(ADMIN_STYLE_TAG_FIELDS).order('name'),
        supabase.from('product_style_tags').select('product_id, style_tag_id'),
        supabase.from('featured_products').select(ADMIN_FEATURED_PRODUCT_FIELDS).order('display_order'),
        supabase.from('environments').select(ADMIN_ENVIRONMENT_FIELDS).order('name'),
        supabase.from('product_environments').select('product_id, environment_id'),
        (supabase.from('product_composition_suggestions' as any) as any).select('product_id, suggested_product_id, display_order').order('display_order'),
        (supabase.from('curated_collections' as any) as any).select('id, title, description, cover_image, display_order, is_active').order('display_order'),
        (supabase.from('curated_collection_products' as any) as any).select('collection_id, product_id, display_order').order('display_order'),
        supabase.from('profiles').select(ADMIN_PROFILE_FIELDS).order('created_at', { ascending: false }),
        supabase.from('user_roles').select(ADMIN_USER_ROLE_FIELDS),
        supabase.from('finish_categories').select(ADMIN_FINISH_CATEGORY_FIELDS).order('display_order'),
        supabase.from('finishes').select(ADMIN_FINISH_FIELDS).order('display_order'),
        supabase.from('product_finish_categories').select('product_id, finish_category_id'),
        supabase.from('designers' as any).select(ADMIN_PRODUCT_DESIGNER_FIELDS).order('name'),
      ]);
      setBrands(mergeLocalHiddenState((b.data as Brand[]) || [], getLocalHiddenBrandIds()));
      setProducts(mergeLocalHiddenState((p.data as Product[]) || [], getLocalHiddenProductIds()));
      setCategories(c.data || []);
      setBrandCategories(bc.data || []);
      setDesigners((d.data as Designer[]) || []);
      setProductDesigners(((pd.data as unknown) as ProductDesigner[]) || []);
      setLandingImages((li.data as LandingImage[]) || []);
      setStyleTags((st.data as StyleTag[]) || []);
      setProductStyleTags((pst.data as ProductStyleTag[]) || []);
      setFeaturedProducts((fp.data as FeaturedProduct[]) || []);
      setEnvironmentsList((envs.data as EnvironmentItem[]) || []);
      setProductEnvironments((pe.data as ProductEnvironment[]) || []);
      setProductCompositionSuggestions((pcs.data as ProductCompositionSuggestion[]) || []);
      setCuratedCollections((cc.data as CuratedCollection[]) || []);
      setCuratedCollectionProducts((ccp.data as CuratedCollectionProduct[]) || []);
      setUserProfiles((profiles.data as UserProfile[]) || []);
      setUserRoles((roles.data as UserRole[]) || []);
      setFinishCategories((fCats.data as FinishCategory[]) || []);
      setFinishItems((fItems.data as FinishItem[]) || []);
      setProductFinishCategories((pfc.data as ProductFinishCategory[]) || []);
    };
    fetchAll();
  }, [isAdmin, loading, navigate]);

  const refreshCatalogData = async () => {
    const [b, p, c, pst, envs, pe, pcs, cc, ccp] = await Promise.all([
      supabase.from('brands').select(ADMIN_BRAND_FIELDS).order('name'),
      supabase.from('products').select(ADMIN_PRODUCT_FIELDS).order('created_at', { ascending: false }),
      supabase.from('categories').select(ADMIN_CATEGORY_FIELDS).order('name'),
      supabase.from('product_style_tags').select('product_id, style_tag_id'),
      supabase.from('environments').select(ADMIN_ENVIRONMENT_FIELDS).order('name'),
      supabase.from('product_environments').select('product_id, environment_id'),
      (supabase.from('product_composition_suggestions' as any) as any).select('product_id, suggested_product_id, display_order').order('display_order'),
      (supabase.from('curated_collections' as any) as any).select('id, title, description, cover_image, display_order, is_active').order('display_order'),
      (supabase.from('curated_collection_products' as any) as any).select('collection_id, product_id, display_order').order('display_order'),
    ]);
    setBrands(mergeLocalHiddenState((b.data as Brand[]) || [], getLocalHiddenBrandIds()));
    setProducts(mergeLocalHiddenState((p.data as Product[]) || [], getLocalHiddenProductIds()));
    setCategories(c.data || []);
    setProductStyleTags((pst.data as ProductStyleTag[]) || []);
    setEnvironmentsList((envs.data as EnvironmentItem[]) || []);
    setProductEnvironments((pe.data as ProductEnvironment[]) || []);
    setProductCompositionSuggestions((pcs.data as ProductCompositionSuggestion[]) || []);
    setCuratedCollections((cc.data as CuratedCollection[]) || []);
    setCuratedCollectionProducts((ccp.data as CuratedCollectionProduct[]) || []);
  };

  const refreshFinishesData = async () => {
    const [fCats, fItems] = await Promise.all([
      supabase.from('finish_categories').select(ADMIN_FINISH_CATEGORY_FIELDS).order('display_order'),
      supabase.from('finishes').select(ADMIN_FINISH_FIELDS).order('display_order'),
    ]);
    setFinishCategories((fCats.data as FinishCategory[]) || []);
    setFinishItems((fItems.data as FinishItem[]) || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'brandLogo' | 'productImages' | 'ambientImages' | 'designerPhoto' | 'pDesignerPhoto', index?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const folder = target === 'brandLogo' ? 'brands' : (target === 'designerPhoto' || target === 'pDesignerPhoto') ? 'designers' : target === 'ambientImages' ? 'products/ambientadas' : 'products';
    const url = await uploadToStorage(file, folder);
    if (target === 'brandLogo') setNewBrand({ ...newBrand, logo: url });
    if (target === 'designerPhoto') setEditingDesigner({ ...editingDesigner, photo_url: url });
    if (target === 'pDesignerPhoto') setEditingPDesigner({ ...editingPDesigner, photo_url: url });
    if (target === 'productImages') {
      const imgs = [...newProduct.images];
      if (index !== undefined) imgs[index] = url;
      else if (imgs.length < 5) imgs.push(url);
      setNewProduct({ ...newProduct, images: imgs });
    }
    if (target === 'ambientImages') {
      const imgs = [...newProduct.ambientImages];
      if (index !== undefined) imgs[index] = url;
      else if (imgs.length < AMBIENT_IMAGE_LIMIT) imgs.push(url);
      setNewProduct({ ...newProduct, ambientImages: imgs });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadToStorage(file, 'landing');
    setNewImageUrl(url);
  };

  const toggleBrandCategory = (categoryId: string) => {
    setSelectedBrandCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const saveBrandCategories = async (brandId: string, categoryIds: string[]) => {
    await supabase.from('brand_categories').delete().eq('brand_id', brandId);
    if (categoryIds.length > 0) {
      const rows = categoryIds.map(cid => ({ brand_id: brandId, category_id: cid }));
      await supabase.from('brand_categories').insert(rows);
    }
    const { data } = await supabase.from('brand_categories').select('brand_id, category_id');
    setBrandCategories(data || []);
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: newBrand.name, logo_url: newBrand.logo || null, segment: newBrand.segment };
    if (editingBrandId) {
      const { data } = await supabase.from('brands').update(payload).eq('id', editingBrandId).select().single();
      if (data) { setBrands(brands.map(b => b.id === editingBrandId ? data : b)); await saveBrandCategories(editingBrandId, selectedBrandCategories); }
      setEditingBrandId(null);
    } else {
      const { data } = await supabase.from('brands').insert(payload).select().single();
      if (data) { setBrands([...brands, data]); await saveBrandCategories(data.id, selectedBrandCategories); }
    }
    setNewBrand({ name: '', logo: '', segment: 'high' });
    setSelectedBrandCategories([]);
  };

  const startEditBrand = (b: Brand) => {
    setEditingBrandId(b.id);
    setNewBrand({ name: b.name, logo: b.logo_url || '', segment: b.segment });
    setSelectedBrandCategories(brandCategories.filter(bc => bc.brand_id === b.id).map(bc => bc.category_id));
  };

  const cancelEditBrand = () => { setEditingBrandId(null); setNewBrand({ name: '', logo: '', segment: 'high' }); setSelectedBrandCategories([]); };

  const saveProductStyleTags = async (productId: string, tagIds: string[]) => {
    await supabase.from('product_style_tags').delete().eq('product_id', productId);
    if (tagIds.length > 0) {
      const rows = tagIds.map(tid => ({ product_id: productId, style_tag_id: tid }));
      await supabase.from('product_style_tags').insert(rows);
    }
    const { data } = await supabase.from('product_style_tags').select('product_id, style_tag_id');
    setProductStyleTags((data as ProductStyleTag[]) || []);
  };

  const saveProductEnvironments = async (productId: string, envIds: string[]) => {
    await supabase.from('product_environments').delete().eq('product_id', productId);
    if (envIds.length > 0) {
      const rows = envIds.map(eid => ({ product_id: productId, environment_id: eid }));
      await supabase.from('product_environments').insert(rows);
    }
    const { data } = await supabase.from('product_environments').select('product_id, environment_id');
    setProductEnvironments((data as ProductEnvironment[]) || []);
  };

  const saveProductCompositionSuggestions = async (productId: string, suggestedProductIds: string[]) => {
    const table = supabase.from('product_composition_suggestions' as any) as any;
    await table.delete().eq('product_id', productId);

    const rows = suggestedProductIds
      .filter(suggestedProductId => suggestedProductId !== productId)
      .slice(0, 4)
      .map((suggestedProductId, index) => ({
        product_id: productId,
        suggested_product_id: suggestedProductId,
        display_order: index,
      }));

    if (rows.length > 0) await table.insert(rows);

    const { data } = await table.select('product_id, suggested_product_id, display_order').order('display_order');
    setProductCompositionSuggestions((data as ProductCompositionSuggestion[]) || []);
  };

  const saveProductFinishCategories = async (productId: string, catIds: string[]) => {
    await supabase.from('product_finish_categories').delete().eq('product_id', productId);
    if (catIds.length > 0) {
      const rows = catIds.map(cid => ({ product_id: productId, finish_category_id: cid }));
      await supabase.from('product_finish_categories').insert(rows);
    }
    const { data } = await supabase.from('product_finish_categories').select('product_id, finish_category_id');
    setProductFinishCategories((data as ProductFinishCategory[]) || []);
  };

  const syncPrimaryDownloadRows = async (productId: string, file2d: string, techSheet: string) => {
    const table = supabase.from('product_downloads' as any) as any;
    await table.delete().eq('product_id', productId).in('download_type', ['2d', 'tech_sheet']);

    const rows = [
      file2d ? { product_id: productId, download_type: '2d', label: 'Bloco 2D', url: file2d, display_order: 1 } : null,
      techSheet ? { product_id: productId, download_type: 'tech_sheet', label: 'Ficha Técnica', url: techSheet, display_order: 0 } : null,
    ].filter(Boolean);

    if (rows.length > 0) await table.insert(rows);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const productImages = newProduct.images.slice(0, PRODUCT_IMAGE_LIMIT);
    const ambientImages = newProduct.ambientImages.slice(0, AMBIENT_IMAGE_LIMIT);
    const payload = {
      name: newProduct.name, images: productImages, ambient_images: ambientImages, brand_id: newProduct.brandId,
      category: newProduct.category, description: cleanProductDescription(newProduct.description) || null,
      file_3d: newProduct.file3d || null, file_2d: newProduct.file2d || null,
      tech_sheet: newProduct.techSheet || null, finish_link: newProduct.finishLink || null,
      designer_id: newProduct.designerId || null,
    };
    if (editingProductId) {
      const { data } = await supabase.from('products').update(payload).eq('id', editingProductId).select().single();
      if (data) {
        setProducts(products.map(p => p.id === editingProductId ? data : p));
        await Promise.all([
          saveProductStyleTags(editingProductId, selectedProductStyles),
          saveProductEnvironments(editingProductId, selectedProductEnvs),
          saveProductCompositionSuggestions(editingProductId, selectedCompositionProductIds),
          saveProductFinishCategories(editingProductId, selectedProductFinishCats),
          syncPrimaryDownloadRows(editingProductId, newProduct.file2d, newProduct.techSheet),
        ]);
      }
      setEditingProductId(null);
    } else {
      const { data } = await supabase.from('products').insert(payload).select().single();
      if (data) {
        setProducts([data, ...products]);
        await Promise.all([
          saveProductStyleTags(data.id, selectedProductStyles),
          saveProductEnvironments(data.id, selectedProductEnvs),
          saveProductCompositionSuggestions(data.id, selectedCompositionProductIds),
          saveProductFinishCategories(data.id, selectedProductFinishCats),
          syncPrimaryDownloadRows(data.id, newProduct.file2d, newProduct.techSheet),
        ]);
      }
    }
    setNewProduct(emptyProduct);
    setSelectedProductStyles([]);
    setSelectedProductEnvs([]);
    setSelectedCompositionProductIds([]);
    setCompositionProductSearch('');
    setSelectedProductFinishCats([]);
  };

  const handleImportProduct = async () => {
    if (!importUrl.trim()) return;
    setIsImporting(true);
    try {
      const trimmedUrl = importUrl.trim();
      const selectedBrandForUrl = (() => {
        try {
          const host = new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`).hostname.replace(/^www\./, '').toLowerCase();
          if (host.includes('americamoveis')) return brands.find(b => b.name.toLowerCase() === 'america moveis');
          if (host.includes('meucentury') || host.includes('centurybrazil')) return brands.find(b => b.name.toLowerCase() === 'century');
          if (host.includes('essenzamoveis')) return brands.find(b => b.name.toLowerCase() === 'essenza');
          if (host.includes('folioliving')) return brands.find(b => b.name.toLowerCase() === 'folio');
          if (host.includes('tissot')) return brands.find(b => b.name.toLowerCase() === 'tissot');
          if (host.includes('doimobrasil')) return brands.find(b => b.name.toLowerCase() === 'doimo');
          if (host.includes('casoca') && /\/cgs(?:\.html|\/|$)/i.test(new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`).pathname)) return brands.find(b => b.name.toLowerCase() === 'cgs');
          if (host.includes('casoca') && /\/grupo-bellarte(?:\.html|\/|$)/i.test(new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`).pathname)) return findBrandByLooseName(brands, ['Bell Arte', "Bell'Arte", 'Bellarte']);
          if (host.includes('greenhousemoveis')) return brands.find(b => b.name.toLowerCase().replace(/\s+/g, '').includes('greenhouse'));
          if (host.includes('feelingestofados')) return brands.find(b => b.name.toLowerCase() === 'feeling');
          if (host.includes('neoboxmoveis')) return brands.find(b => b.name.toLowerCase() === 'neobox');
          if (host.includes('pontovirgula')) return findBrandByLooseName(brands, ['Ponto Vírgula', 'Ponto Virgula', 'Ponto e Virgula', 'Pontovirgula', 'Pontoevirgula']);
        } catch { /* fall back to generic importer */ }
        return undefined;
      })();

      const data = await invokeAdminEdgeFunction<BulkImportSummary>('bulk-import-century-category', {
        categoryUrl: trimmedUrl,
        maxImages: 8,
        brandName: selectedBrandForUrl?.name || '',
        brandSegment: selectedBrandForUrl?.segment || 'high',
        startIndex: 0,
        limit: 1,
      });

      const imported = ((data.products || []) as BulkImportProductResult[]).find(product => !product.error);
      if (!imported) {
        throw new Error('A importacao automatica nao conseguiu extrair dados suficientes desta URL. Cadastre o produto manualmente.');
      }

      await refreshCatalogData();
      setImportUrl('');
      alert(`Produto ${imported.action === 'updated' ? 'atualizado' : 'cadastrado'}: ${imported.name || 'importado'}`);
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Erro ao importar: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleBulkImportCentury = async () => {
    if (!centuryCategoryUrl.trim()) return;
    const autoBulkBrandName = inferKnownBrandNameFromImportUrl(centuryCategoryUrl.trim());
    const detectedBulkBrand = (() => {
      try {
        const host = new URL(centuryCategoryUrl.trim().startsWith('http') ? centuryCategoryUrl.trim() : `https://${centuryCategoryUrl.trim()}`).hostname.replace(/^www\./, '').toLowerCase();
        if (host.includes('americamoveis')) return brands.find(b => b.name.toLowerCase() === 'america moveis');
        if (host.includes('meucentury') || host.includes('centurybrazil')) return brands.find(b => b.name.toLowerCase() === 'century');
        if (host.includes('essenzamoveis')) return brands.find(b => b.name.toLowerCase() === 'essenza');
        if (host.includes('folioliving')) return brands.find(b => b.name.toLowerCase() === 'folio');
        if (host.includes('tissot')) return brands.find(b => b.name.toLowerCase() === 'tissot');
        if (host.includes('doimobrasil')) return brands.find(b => b.name.toLowerCase() === 'doimo');
        if (host.includes('casoca') && /\/cgs(?:\.html|\/|$)/i.test(new URL(centuryCategoryUrl.trim().startsWith('http') ? centuryCategoryUrl.trim() : `https://${centuryCategoryUrl.trim()}`).pathname)) return brands.find(b => b.name.toLowerCase() === 'cgs');
        if (host.includes('casoca') && /\/grupo-bellarte(?:\.html|\/|$)/i.test(new URL(centuryCategoryUrl.trim().startsWith('http') ? centuryCategoryUrl.trim() : `https://${centuryCategoryUrl.trim()}`).pathname)) return findBrandByLooseName(brands, ['Bell Arte', "Bell'Arte", 'Bellarte']);
        if (host.includes('greenhousemoveis')) return brands.find(b => b.name.toLowerCase().replace(/\s+/g, '').includes('greenhouse'));
        if (host.includes('feelingestofados')) return brands.find(b => b.name.toLowerCase() === 'feeling');
        if (host.includes('neoboxmoveis')) return brands.find(b => b.name.toLowerCase() === 'neobox');
        if (host.includes('pontovirgula')) return findBrandByLooseName(brands, ['Ponto Vírgula', 'Ponto Virgula', 'Ponto e Virgula', 'Pontovirgula', 'Pontoevirgula']);
      } catch { /* use selected brand */ }
      return undefined;
    })();
    const selectedBulkBrand = detectedBulkBrand || (!autoBulkBrandName ? brands.find(brand => brand.id === bulkImportBrandId) : undefined);
    const typedBulkBrandName = bulkImportBrandName.trim();
    const resolvedBulkBrandName = detectedBulkBrand?.name || autoBulkBrandName || selectedBulkBrand?.name || typedBulkBrandName;
    const selectedBulkCategoryName = categories.find(category => category.id === selectedBulkCategoryId)?.name || '';
    const selectedBulkEnvironmentNames = selectedBulkEnvironmentIds
      .map(id => environmentsList.find(env => env.id === id)?.name)
      .filter((name): name is string => Boolean(name));

    setIsBulkImportingCentury(true);
    setBulkImportSummary(null);

    try {
      const allProducts: BulkImportProductResult[] = [];
      let cachedProductLinks: BulkImportProductLink[] = [];
      let startIndex = 0;
      let aggregate: BulkImportSummary | null = null;
      const isGreenhouseBulkImport = /greenhousemoveis\.com\.br/i.test(centuryCategoryUrl);
      const isFeelingBulkImport = /feelingestofados\.com\.br/i.test(centuryCategoryUrl);
      const isNeoboxBulkImport = /neoboxmoveis\.com\.br/i.test(centuryCategoryUrl);
      const isPontoVirgulaBulkImport = /pontovirgula\.com/i.test(centuryCategoryUrl);
      const bulkBatchLimit = isGreenhouseBulkImport || isFeelingBulkImport ? 1 : isNeoboxBulkImport ? 2 : isPontoVirgulaBulkImport ? 1 : 6;
      const bulkMaxImages = isGreenhouseBulkImport || isFeelingBulkImport || isPontoVirgulaBulkImport ? 5 : 8;

      do {
        const data = await invokeAdminEdgeFunction<BulkImportSummary>('bulk-import-century-category', {
          categoryUrl: centuryCategoryUrl.trim(),
          maxImages: bulkMaxImages,
          brandName: resolvedBulkBrandName,
          brandSegment: selectedBulkBrand?.segment || detectedBulkBrand?.segment || 'high',
          categoryId: selectedBulkCategoryId,
          categoryName: selectedBulkCategoryName,
          environmentIds: selectedBulkEnvironmentIds,
          environmentNames: selectedBulkEnvironmentNames,
          startIndex,
          limit: bulkBatchLimit,
          productLinks: cachedProductLinks,
        });

        if (Array.isArray(data.productLinks) && data.productLinks.length > 0) {
          cachedProductLinks = data.productLinks;
        }

        if (data.sourceRateLimited) {
          const waitMs = Math.max(Number(data.retryAfterMs || 0), isPontoVirgulaBulkImport ? 120_000 : 30_000);
          aggregate = {
            ...((aggregate || data) as BulkImportSummary),
            hasMore: true,
            nextStartIndex: startIndex,
            created: aggregate?.created || 0,
            updated: aggregate?.updated || 0,
            failed: aggregate?.failed || 0,
            productsWithoutFiveImages: allProducts.filter(product => product.warnings.includes('menos_de_5_imagens')).length,
            productsWithout2d: allProducts.filter(product => product.warnings.includes('sem_bloco_2d')).length,
            productsWithout3d: allProducts.filter(product => product.warnings.includes('sem_bloco_3d')).length,
            products: [...allProducts],
            sourceRateLimited: true,
            retryAfterMs: waitMs,
            message: data.message,
          };
          setBulkImportSummary(aggregate);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }

        allProducts.push(...((data.products || []) as BulkImportProductResult[]));
        aggregate = {
          ...(data as BulkImportSummary),
          created: (aggregate?.created || 0) + (data.created || 0),
          updated: (aggregate?.updated || 0) + (data.updated || 0),
          failed: (aggregate?.failed || 0) + (data.failed || 0),
          productsWithoutFiveImages: allProducts.filter(product => product.warnings.includes('menos_de_5_imagens')).length,
          productsWithout2d: allProducts.filter(product => product.warnings.includes('sem_bloco_2d')).length,
          productsWithout3d: allProducts.filter(product => product.warnings.includes('sem_bloco_3d')).length,
          products: [...allProducts],
        };
        setBulkImportSummary(aggregate);
        startIndex = Number(data.nextStartIndex || startIndex + bulkBatchLimit);
        if (aggregate?.hasMore && (isFeelingBulkImport || isNeoboxBulkImport || isPontoVirgulaBulkImport)) {
          const batchPauseMs = isPontoVirgulaBulkImport ? 25_000 : 900;
          await new Promise(resolve => setTimeout(resolve, batchPauseMs));
        }
      } while (aggregate?.hasMore);

      await refreshCatalogData();
      alert(`Importacao concluida: ${aggregate?.created || 0} criados, ${aggregate?.updated || 0} atualizados, ${aggregate?.failed || 0} falhas.`);
    } catch (err: any) {
      console.error('Universal bulk import error:', err);
      alert('Erro no cadastro massivo: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsBulkImportingCentury(false);
    }
  };

  const handleImportCenturyFinishes = async () => {
    if (!selectedFinishBrand || !centuryFinishUrl.trim()) return;
    setIsImportingCenturyFinishes(true);
    setFinishImportSummary(null);

    try {
      const selectedBrand = brands.find(brand => brand.id === selectedFinishBrand);
      const { data, error } = await supabase.functions.invoke('bulk-import-century-finishes', {
        body: {
          sourceUrl: centuryFinishUrl.trim(),
          brandName: selectedBrand?.name || '',
          brandSegment: (selectedBrand as any)?.segment || 'high',
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao importar acabamentos');

      setFinishImportSummary(data as FinishImportSummary);
      await refreshFinishesData();
      alert(`Acabamentos importados: ${data.finishesCreated || 0} criados, ${data.finishesUpdated || 0} atualizados, ${data.failed || 0} falhas.`);
    } catch (err: any) {
      console.error('Universal finishes import error:', err);
      let message = err.message || 'Tente novamente';
      try {
        const context = err.context;
        if (context?.clone) {
          const body = await context.clone().json();
          message = body?.error || message;
        }
      } catch { /* keep original message */ }
      alert('Erro ao importar acabamentos: ' + message);
    } finally {
      setIsImportingCenturyFinishes(false);
    }
  };

  const startEditProduct = (p: Product) => {
    const { productImages, ambientImages } = splitProductImages(p.images, p.ambient_images);
    setEditingProductId(p.id);
    setNewProduct({
      name: p.name, images: productImages, ambientImages, brandId: p.brand_id,
      category: p.category, description: cleanProductDescription(p.description),
      file3d: p.file_3d || '', file2d: p.file_2d || '',
      techSheet: p.tech_sheet || '', finishLink: p.finish_link || '',
      designerId: (p as any).designer_id || '',
    });
    setSelectedProductStyles(
      productStyleTags.filter(pst => pst.product_id === p.id).map(pst => pst.style_tag_id)
    );
    setSelectedProductEnvs(
      productEnvironments.filter(pe => pe.product_id === p.id).map(pe => pe.environment_id)
    );
    setSelectedCompositionProductIds(
      productCompositionSuggestions
        .filter(item => item.product_id === p.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(item => item.suggested_product_id)
    );
    setCompositionProductSearch('');
    setSelectedProductFinishCats(
      productFinishCategories.filter(pfc => pfc.product_id === p.id).map(pfc => pfc.finish_category_id)
    );
  };

  const cancelEdit = () => {
    setEditingProductId(null);
    setNewProduct(emptyProduct);
    setSelectedProductStyles([]);
    setSelectedProductEnvs([]);
    setSelectedCompositionProductIds([]);
    setCompositionProductSearch('');
    setSelectedProductFinishCats([]);
  };

  const deleteBrand = async (id: string) => {
    const brand = brands.find(item => item.id === id);
    if (!brand || deletingBrandId) return;

    const brandProducts = products.filter(product => product.brand_id === id);
    const productsWarning = brandProducts.length > 0
      ? `\n\nEsta marca possui ${brandProducts.length} produto(s). Ao excluir a marca, esses produtos tambem serao removidos do catalogo.`
      : '';
    if (!confirm(`Excluir definitivamente a marca ${brand.name}?${productsWarning}\n\nEsta acao nao pode ser desfeita.`)) return;

    setDeletingBrandId(id);
    try {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;

      setLocalBrandHidden(id, false);
      brandProducts.forEach(product => setLocalProductHidden(product.id, false));
      setBrands(current => current.filter(item => item.id !== id));
      setProducts(current => current.filter(item => item.brand_id !== id));
      setBrandCategories(current => current.filter(item => item.brand_id !== id));
      if (editingBrandId === id) {
        setEditingBrandId(null);
        setNewBrand({ name: '', logo: '', segment: 'high' });
        setSelectedBrandCategories([]);
      }
      if (brandProducts.some(product => product.id === editingProductId)) cancelEdit();
    } catch (error: any) {
      alert(`Erro ao excluir marca: ${error?.message || 'Tente novamente'}`);
    } finally {
      setDeletingBrandId(null);
    }
  };

  const deleteProduct = async (id: string) => {
    const product = products.find(item => item.id === id);
    if (!product || deletingProductId) return;

    const { count: projectItemCount, error: projectItemError } = await supabase
      .from('project_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);

    if (projectItemError) {
      alert(`Erro ao verificar vinculos do produto: ${projectItemError.message}`);
      return;
    }

    const projectWarning = (projectItemCount || 0) > 0
      ? `\n\nAtencao: este produto esta em ${projectItemCount} projeto(s). A exclusao tambem remove esses itens dos projetos.`
      : '';
    if (!confirm(`Excluir definitivamente o produto ${product.name}?${projectWarning}\n\nEsta acao nao pode ser desfeita.`)) return;

    setDeletingProductId(id);
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;

      setLocalProductHidden(id, false);
      setProducts(current => current.filter(item => item.id !== id));
      setProductStyleTags(current => current.filter(item => item.product_id !== id));
      setProductEnvironments(current => current.filter(item => item.product_id !== id));
      setProductFinishCategories(current => current.filter(item => item.product_id !== id));
      setProductCompositionSuggestions(current => current.filter(item => item.product_id !== id && item.suggested_product_id !== id));
      setFeaturedProducts(current => current.filter(item => item.product_id !== id));
      setCuratedCollectionProducts(current => current.filter(item => item.product_id !== id));
      setSelectedCompositionProductIds(current => current.filter(itemId => itemId !== id));
      setSelectedCuratedProductIds(current => current.filter(itemId => itemId !== id));
      if (editingProductId === id) cancelEdit();
    } catch (error: any) {
      alert(`Erro ao excluir produto: ${error?.message || 'Tente novamente'}`);
    } finally {
      setDeletingProductId(null);
    }
  };
  const toggleBrandHidden = async (brand: Brand) => {
    const nextHidden = brand.is_hidden !== true;
    const { error } = await (supabase.from('brands') as any).update({ is_hidden: nextHidden }).eq('id', brand.id);

    if (error && !isHiddenColumnMissing(error)) {
      alert(`Erro ao ${nextHidden ? 'ocultar' : 'mostrar'} marca: ${error.message}`);
      return;
    }

    if (error && isHiddenColumnMissing(error)) {
      setLocalBrandHidden(brand.id, nextHidden);
      alert('A coluna de ocultacao ainda nao esta aplicada no Supabase. A alteracao ficara salva temporariamente neste navegador ate aplicar a migration.');
    }

    setBrands(current => current.map(item => item.id === brand.id ? { ...item, is_hidden: nextHidden } : item));
  };

  const toggleProductHidden = async (product: Product) => {
    const nextHidden = product.is_hidden !== true;
    const { error } = await (supabase.from('products') as any).update({ is_hidden: nextHidden }).eq('id', product.id);

    if (error && !isHiddenColumnMissing(error)) {
      alert(`Erro ao ${nextHidden ? 'ocultar' : 'mostrar'} produto: ${error.message}`);
      return;
    }

    if (error && isHiddenColumnMissing(error)) {
      setLocalProductHidden(product.id, nextHidden);
      alert('A coluna de ocultacao ainda nao esta aplicada no Supabase. A alteracao ficara salva temporariamente neste navegador ate aplicar a migration.');
    }

    setProducts(current => current.map(item => item.id === product.id ? { ...item, is_hidden: nextHidden } : item));
  };
  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const { data } = await supabase.from('categories').insert({ name: newCategory.trim() }).select().single();
    if (data) setCategories([...categories, data]);
    setNewCategory('');
  };
  const deleteCategory = async (id: string) => { await supabase.from('categories').delete().eq('id', id); setCategories(categories.filter(c => c.id !== id)); };

  const saveCuratedCollectionProducts = async (collectionId: string, productIds: string[]) => {
    const table = supabase.from('curated_collection_products' as any) as any;
    const deleteResult = await table.delete().eq('collection_id', collectionId);
    if (deleteResult.error) throw deleteResult.error;

    const rows = productIds.map((productId, index) => ({
      collection_id: collectionId,
      product_id: productId,
      display_order: index,
    }));

    if (rows.length > 0) {
      const insertResult = await table.insert(rows);
      if (insertResult.error) throw insertResult.error;
    }

    const { data, error } = await table.select('collection_id, product_id, display_order').order('display_order');
    if (error) throw error;
    setCuratedCollectionProducts((data as CuratedCollectionProduct[]) || []);
  };

  const handleSaveCuratedCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCuratedProductIds.length === 0) {
      alert('Adicione pelo menos 1 produto na seleção antes de salvar.');
      return;
    }

    const table = supabase.from('curated_collections' as any) as any;
    const payload = {
      title: newCuratedCollection.title.trim(),
      description: newCuratedCollection.description.trim() || null,
      cover_image: newCuratedCollection.coverImage.trim() || null,
      display_order: Number(newCuratedCollection.displayOrder) || 0,
      is_active: newCuratedCollection.isActive,
    };

    try {
      if (editingCuratedCollectionId) {
        const { data, error } = await table.update(payload).eq('id', editingCuratedCollectionId).select().single();
        if (error) throw error;
        if (data) {
          setCuratedCollections(curatedCollections.map(collection => collection.id === editingCuratedCollectionId ? data as CuratedCollection : collection));
          await saveCuratedCollectionProducts(editingCuratedCollectionId, selectedCuratedProductIds);
        }
      } else {
        const { data, error } = await table.insert(payload).select().single();
        if (error) throw error;
        if (data) {
          setCuratedCollections([...curatedCollections, data as CuratedCollection].sort((a, b) => a.display_order - b.display_order));
          await saveCuratedCollectionProducts((data as CuratedCollection).id, selectedCuratedProductIds);
        }
      }

      setNewCuratedCollection(emptyCuratedCollection);
      setSelectedCuratedProductIds([]);
      setCuratedProductSearch('');
      setEditingCuratedCollectionId(null);
      alert('Seleção salva na Coleção YLEON.');
    } catch (error: any) {
      console.error('Erro ao salvar coleção:', error);
      alert(`Não foi possível salvar a seleção: ${error?.message || 'verifique as permissões do banco e tente novamente.'}`);
    }
  };

  const startEditCuratedCollection = (collection: CuratedCollection) => {
    setEditingCuratedCollectionId(collection.id);
    setNewCuratedCollection({
      title: collection.title,
      description: collection.description || '',
      coverImage: collection.cover_image || '',
      displayOrder: collection.display_order,
      isActive: collection.is_active,
    });
    setSelectedCuratedProductIds(
      curatedCollectionProducts
        .filter(item => item.collection_id === collection.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(item => item.product_id)
    );
    setCuratedProductSearch('');
  };

  const cancelEditCuratedCollection = () => {
    setEditingCuratedCollectionId(null);
    setNewCuratedCollection(emptyCuratedCollection);
    setSelectedCuratedProductIds([]);
    setCuratedProductSearch('');
  };

  const deleteCuratedCollection = async (id: string) => {
    await (supabase.from('curated_collections' as any) as any).delete().eq('id', id);
    setCuratedCollections(curatedCollections.filter(collection => collection.id !== id));
    setCuratedCollectionProducts(curatedCollectionProducts.filter(item => item.collection_id !== id));
    if (editingCuratedCollectionId === id) cancelEditCuratedCollection();
  };

  // Style tag CRUD
  const addStyleTag = async () => {
    if (!newStyleTag.trim()) return;
    const { data } = await supabase.from('design_style_tags').insert({ name: newStyleTag.trim() }).select().single();
    if (data) setStyleTags([...styleTags, data as StyleTag]);
    setNewStyleTag('');
  };
  const deleteStyleTag = async (id: string) => {
    await supabase.from('design_style_tags').delete().eq('id', id);
    setStyleTags(styleTags.filter(t => t.id !== id));
  };

  // Environment CRUD
  const addEnvironment = async () => {
    if (!newEnvironmentName.trim()) return;
    const { data } = await supabase.from('environments').insert({ name: newEnvironmentName.trim() }).select().single();
    if (data) setEnvironmentsList([...environmentsList, data as EnvironmentItem]);
    setNewEnvironmentName('');
  };
  const deleteEnvironment = async (id: string) => {
    await supabase.from('environments').delete().eq('id', id);
    setEnvironmentsList(environmentsList.filter(e => e.id !== id));
  };

  // Featured products
  const toggleFeaturedProduct = async (productId: string) => {
    const existing = featuredProducts.find(fp => fp.product_id === productId);
    if (existing) {
      await supabase.from('featured_products').delete().eq('id', existing.id);
      setFeaturedProducts(featuredProducts.filter(fp => fp.id !== existing.id));
    } else {
      if (featuredProducts.length >= 4) return;
      const { data } = await supabase.from('featured_products').insert({
        product_id: productId,
        display_order: featuredProducts.length,
      }).select().single();
      if (data) setFeaturedProducts([...featuredProducts, data as FeaturedProduct]);
    }
  };

  // Designer CRUD
  const handleSaveDesigner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (designers.length >= 2 && !editingDesignerId) return;
    const payload = {
      name: editingDesigner.name,
      description: editingDesigner.description || null,
      photo_url: editingDesigner.photo_url || null,
      display_order: editingDesignerId ? designers.find(d => d.id === editingDesignerId)?.display_order || 0 : designers.length,
    };
    if (editingDesignerId) {
      const { data } = await supabase.from('featured_designers').update(payload).eq('id', editingDesignerId).select().single();
      if (data) setDesigners(designers.map(d => d.id === editingDesignerId ? data as Designer : d));
      setEditingDesignerId(null);
    } else {
      const { data } = await supabase.from('featured_designers').insert(payload).select().single();
      if (data) setDesigners([...designers, data as Designer]);
    }
    setEditingDesigner({ name: '', description: '', photo_url: '' });
  };

  const startEditDesigner = (d: Designer) => {
    setEditingDesignerId(d.id);
    setEditingDesigner({ name: d.name, description: d.description || '', photo_url: d.photo_url || '' });
  };

  const deleteDesigner = async (id: string) => {
    await supabase.from('featured_designers').delete().eq('id', id);
    setDesigners(designers.filter(d => d.id !== id));
    if (editingDesignerId === id) { setEditingDesignerId(null); setEditingDesigner({ name: '', description: '', photo_url: '' }); }
  };

  // Product Designers CRUD (assina a peça)
  const handleSavePDesigner = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: editingPDesigner.name,
      bio: editingPDesigner.bio || null,
      photo_url: editingPDesigner.photo_url || null,
    };
    if (editingPDesignerId) {
      const { data } = await (supabase.from('designers' as any) as any).update(payload).eq('id', editingPDesignerId).select().single();
      if (data) setProductDesigners(productDesigners.map(d => d.id === editingPDesignerId ? (data as ProductDesigner) : d));
      setEditingPDesignerId(null);
    } else {
      const { data } = await (supabase.from('designers' as any) as any).insert(payload).select().single();
      if (data) setProductDesigners([...productDesigners, data as ProductDesigner]);
    }
    setEditingPDesigner({ name: '', bio: '', photo_url: '' });
  };

  const startEditPDesigner = (d: ProductDesigner) => {
    setEditingPDesignerId(d.id);
    setEditingPDesigner({ name: d.name, bio: d.bio || '', photo_url: d.photo_url || '' });
  };

  const deletePDesigner = async (id: string) => {
    if (!confirm('Excluir este designer? Os produtos vinculados ficarão sem designer.')) return;
    await (supabase.from('designers' as any) as any).delete().eq('id', id);
    setProductDesigners(productDesigners.filter(d => d.id !== id));
    if (editingPDesignerId === id) { setEditingPDesignerId(null); setEditingPDesigner({ name: '', bio: '', photo_url: '' }); }
  };

  // Landing images CRUD
  const addLandingImage = async () => {
    if (!newImageUrl.trim()) return;
    const { data } = await supabase.from('landing_images').insert({
      image_url: newImageUrl, display_order: landingImages.length,
    }).select().single();
    if (data) setLandingImages([...landingImages, data as LandingImage]);
    setNewImageUrl('');
  };

  const deleteLandingImage = async (id: string) => {
    await supabase.from('landing_images').delete().eq('id', id);
    setLandingImages(landingImages.filter(li => li.id !== id));
  };

  const createSeller = async () => {
    if (!newSeller.fullName.trim() || !newSeller.email.trim() || !newSeller.password) {
      alert('Preencha nome, email e senha provisoria do usuario.');
      return;
    }

    setIsCreatingSeller(true);
    try {
      const data = await invokeAdminEdgeFunction<{ success: boolean; error?: string; profile?: UserProfile; role?: UserRole }>('create-seller', {
        fullName: newSeller.fullName.trim(),
        email: newSeller.email.trim(),
        password: newSeller.password,
        role: newSeller.role,
        phone: newSeller.phone.trim(),
        officeName: newSeller.officeName.trim(),
        sellerId: newSeller.role === 'arquiteto' ? newSeller.sellerId || null : null,
        active: newSeller.active,
      });
      if (!data?.success) throw new Error(data?.error || 'Nao foi possivel cadastrar o usuario');

      if (data.profile) {
        setUserProfiles(prev => [
          data.profile as UserProfile,
          ...prev.filter(profile => profile.user_id !== data.profile.user_id),
        ]);
      }
      if (data.role) {
        setUserRoles(prev => [
          data.role as UserRole,
          ...prev.filter(role => !(role.user_id === data.role.user_id && role.role === data.role.role)),
        ]);
      }

      setNewSeller({ fullName: '', email: '', password: '', role: 'arquiteto', phone: '', officeName: '', sellerId: '', active: true });
      alert('Usuario cadastrado com sucesso.');
    } catch (err: any) {
      console.error('Create seller error:', err);
      alert('Erro ao cadastrar usuario: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsCreatingSeller(false);
    }
  };

  // User approval
  const approveUser = async (userId: string) => {
    await (supabase as any).from('profiles').update({ approved: true, is_active: true }).eq('user_id', userId);
    setUserProfiles(userProfiles.map(u => u.user_id === userId ? { ...u, approved: true, is_active: true } : u));
  };

  const promoteSeller = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role: 'vendedor' }, { onConflict: 'user_id,role' })
      .select()
      .single();

    await supabase.from('profiles').update({ seller_id: null }).eq('user_id', userId);
    if (data) setUserRoles(prev => [...prev.filter(role => !(role.user_id === userId && role.role === 'vendedor')), data as UserRole]);
    setUserProfiles(prev => prev.map(profile => profile.user_id === userId ? { ...profile, seller_id: null } : profile));
  };

  const demoteSeller = async (userId: string) => {
    await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'vendedor');
    setUserRoles(prev => prev.filter(role => !(role.user_id === userId && role.role === 'vendedor')));
  };

  const updateUserSeller = async (userId: string, sellerId: string) => {
    const nextSellerId = sellerId || null;
    await supabase.from('profiles').update({ seller_id: nextSellerId }).eq('user_id', userId);
    setUserProfiles(prev => prev.map(profile => profile.user_id === userId ? { ...profile, seller_id: nextSellerId } : profile));
  };

  const updateUserBirthDate = async (userId: string, birthDate: string) => {
    const nextBirthDate = birthDate || null;
    await (supabase as any).from('profiles').update({ birth_date: nextBirthDate }).eq('user_id', userId);
    setUserProfiles(prev => prev.map(profile => profile.user_id === userId ? { ...profile, birth_date: nextBirthDate } : profile));
  };

  const updateUserProfileField = async (userId: string, field: 'phone' | 'office_name' | 'is_active', value: string | boolean) => {
    const nextValue = typeof value === 'string' ? value.trim() || null : value;
    await (supabase as any).from('profiles').update({ [field]: nextValue }).eq('user_id', userId);
    setUserProfiles(prev => prev.map(profile => profile.user_id === userId ? { ...profile, [field]: nextValue } : profile));
  };

  const deleteUserPermanently = async (userId: string) => {
    if (user?.id === userId) {
      alert('Nao e permitido excluir o proprio usuario logado.');
      return;
    }

    const target = userProfiles.find(profile => profile.user_id === userId);
    const label = target?.full_name || 'este usuario';
    if (!confirm(`Excluir definitivamente ${label}? Esta acao remove o acesso do Supabase Auth e nao pode ser desfeita.`)) return;

    setDeletingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Nao foi possivel excluir o usuario');

      setUserProfiles(prev => prev.filter(u => u.user_id !== userId));
      setUserRoles(prev => prev.filter(role => role.user_id !== userId));
      alert('Usuario excluido definitivamente.');
    } catch (err: any) {
      console.error('Delete user error:', err);
      const message = await getFunctionErrorMessage(err, 'Tente novamente');
      alert('Erro ao excluir usuario: ' + message);
    } finally {
      setDeletingUserId(null);
    }
  };

  // Finish CRUD
  const brandFinishCategories = finishCategories.filter(fc => fc.brand_id === selectedFinishBrand);
  const addFinishCategory = async () => {
    if (!newFinishCategoryName.trim() || !selectedFinishBrand) return;
    const { data } = await supabase.from('finish_categories').insert({
      brand_id: selectedFinishBrand, name: newFinishCategoryName.trim(), display_order: brandFinishCategories.length, finish_group: newFinishGroup,
    } as any).select().single();
    if (data) setFinishCategories([...finishCategories, data as FinishCategory]);
    setNewFinishCategoryName('');
  };
  const deleteFinishCategory = async (id: string) => {
    await supabase.from('finish_categories').delete().eq('id', id);
    setFinishCategories(finishCategories.filter(fc => fc.id !== id));
    setFinishItems(finishItems.filter(fi => fi.finish_category_id !== id));
  };
  const addFinishItems = async (categoryId: string, images: string[]) => {
    if (!categoryId || images.length === 0) return;
    const existingCount = finishItems.filter(f => f.finish_category_id === categoryId).length;
    const rows = images.map((img, i) => ({
      finish_category_id: categoryId,
      name: String(existingCount + i + 1),
      image_url: img,
      display_order: existingCount + i,
    }));
    const { data } = await supabase.from('finishes').insert(rows).select();
    if (data) setFinishItems([...finishItems, ...(data as FinishItem[])]);
  };
  const deleteFinishItem = async (id: string) => {
    await supabase.from('finishes').delete().eq('id', id);
    setFinishItems(finishItems.filter(fi => fi.id !== id));
  };
  const [finishUploadPreviews, setFinishUploadPreviews] = useState<{ file: File; preview: string; name: string }[]>([]);
  const [uploadingFinishes, setUploadingFinishes] = useState(false);
  const handleFinishBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const previews = files.map(file => {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return { file, preview: URL.createObjectURL(file), name: baseName };
    });
    setFinishUploadPreviews(prev => [...prev, ...previews]);
  };
  const updateFinishPreviewName = (index: number, name: string) => {
    setFinishUploadPreviews(prev => prev.map((item, i) => i === index ? { ...item, name } : item));
  };
  const handleSaveFinishBatch = async () => {
    if (!selectedFinishCategory || finishUploadPreviews.length === 0) return;
    setUploadingFinishes(true);
    const existingCount = finishItems.filter(f => f.finish_category_id === selectedFinishCategory).length;

    // Upload all files to storage first
    const rows = [];
    for (let i = 0; i < finishUploadPreviews.length; i++) {
      const item = finishUploadPreviews[i];
      const url = await uploadToStorage(item.file, `finishes/${selectedFinishCategory}`);
      rows.push({
        finish_category_id: selectedFinishCategory,
        name: item.name.trim() || String(existingCount + i + 1),
        image_url: url,
        display_order: existingCount + i,
      });
    }

    const { data } = await supabase.from('finishes').insert(rows).select();
    if (data) setFinishItems([...finishItems, ...(data as FinishItem[])]);
    setFinishUploadPreviews([]);
    setUploadingFinishes(false);
  };

  // Product finish categories
  interface ProductFinishCategory { product_id: string; finish_category_id: string; }
  const [productFinishCategories, setProductFinishCategories] = useState<ProductFinishCategory[]>([]);
  const [selectedProductFinishCats, setSelectedProductFinishCats] = useState<string[]>([]);

  const pendingUsers = userProfiles.filter(u => !u.approved);
  const approvedUsers = userProfiles.filter(u => u.approved);
  const roleMap = new Map<string, Set<UserRole['role']>>();
  userRoles.forEach(role => {
    const roles = roleMap.get(role.user_id) ?? new Set<UserRole['role']>();
    roles.add(role.role);
    roleMap.set(role.user_id, roles);
  });
  const getPrimaryRole = (userId: string) => {
    const roles = roleMap.get(userId);
    if (roles?.has('admin')) return 'admin';
    if (roles?.has('ceo')) return 'ceo';
    if (roles?.has('gestor')) return 'gestor';
    if (roles?.has('financeiro')) return 'financeiro';
    if (roles?.has('vendedor')) return 'vendedor';
    if (roles?.has('arquiteto')) return 'arquiteto';
    return 'user';
  };
  const sellerUsers = approvedUsers.filter(userProfile => getPrimaryRole(userProfile.user_id) === 'vendedor');
  const sellerNameMap = new Map(sellerUsers.map(seller => [seller.user_id, seller.full_name || 'Vendedor']));
  const roleLabel = (role: ReturnType<typeof getPrimaryRole>) => {
    if (role === 'admin') return 'Admin';
    if (role === 'ceo') return 'CEO';
    if (role === 'gestor') return 'Gerente';
    if (role === 'financeiro') return 'Financeiro';
    if (role === 'vendedor') return 'Vendedor';
    return 'Arquiteto';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const featuredProductIds = new Set(featuredProducts.map(fp => fp.product_id));

  const SectionHeader = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
    <div className="mb-8 pb-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-serif text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary py-12 px-8">
      <div className="max-w-6xl mx-auto space-y-16">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-serif text-foreground">Painel Administrativo</h2>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft size={14} /> Voltar ao Catálogo
          </button>
        </div>

        <section className="space-y-6">
          <PriceMarkupTools />
          <details className="rounded-2xl border border-border bg-card p-8">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Importar tabela de precos da Cotacao</summary>
            <div className="mt-6 space-y-4">
              <PriceImportTools showHeading={false} />
            </div>
          </details>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 1: CADASTRO */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1.5 rounded-full">Seção 1</span>
            <h2 className="text-2xl font-serif text-foreground">Cadastro</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Marcas */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Plus} title="Marcas" subtitle="Cadastro e edição de marcas" />
              {editingBrandId && (
                <button onClick={cancelEditBrand} className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"><X size={12} /> Cancelar edição</button>
              )}
              <form onSubmit={handleSaveBrand} className="space-y-4">
                <input required placeholder="Nome da Marca"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  value={newBrand.name} onChange={e => setNewBrand({ ...newBrand, name: e.target.value })} />
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Logo (Upload)</label>
                  <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'brandLogo')} className="w-full text-xs text-foreground" />
                  {newBrand.logo && <img src={newBrand.logo} className="h-12 object-contain bg-secondary p-2 border border-border rounded" alt="" />}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Categorias visíveis nesta marca</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-lg p-2 bg-secondary">
                    {categories.length === 0 && <p className="text-xs text-muted-foreground italic p-2">Nenhuma categoria cadastrada</p>}
                    {categories.map(cat => (
                      <button key={cat.id} type="button" onClick={() => toggleBrandCategory(cat.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left transition-colors ${
                          selectedBrandCategories.includes(cat.id) ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          selectedBrandCategories.includes(cat.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                        }`}>{selectedBrandCategories.includes(cat.id) && <Check size={10} />}</div>
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  {selectedBrandCategories.length === 0 && <p className="text-[10px] text-muted-foreground">Nenhuma selecionada = todas visíveis</p>}
                </div>
                <button className="w-full bg-primary text-primary-foreground p-3 rounded-lg text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2">
                  {editingBrandId ? <><Save size={14} /> Atualizar Marca</> : 'Salvar Marca'}
                </button>
              </form>
              <div className="mt-6 space-y-2 max-h-48 overflow-y-auto">
                {brands.map(b => (
                  <div key={b.id} className={`flex justify-between items-center p-3 rounded-lg ${b.is_hidden ? 'bg-muted/70 border border-dashed border-muted-foreground/30' : 'bg-secondary'}`}>
                    <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                      <span className={b.is_hidden ? 'truncate text-muted-foreground line-through' : 'truncate'}>{b.name}</span>
                      {b.is_hidden && (
                        <span className="shrink-0 rounded-full border border-muted-foreground/30 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                          Oculta
                        </span>
                      )}
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEditBrand(b)} className="text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      <button
                        type="button"
                        onClick={() => void toggleBrandHidden(b)}
                        className={b.is_hidden ? 'text-accent hover:text-foreground' : 'text-muted-foreground hover:text-foreground'}
                        title={b.is_hidden ? 'Mostrar marca no catalogo' : 'Ocultar marca do catalogo'}
                        aria-label={b.is_hidden ? `Mostrar marca ${b.name}` : `Ocultar marca ${b.name}`}
                      >
                        {b.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBrand(b.id)}
                        disabled={deletingBrandId === b.id}
                        className="text-destructive disabled:cursor-wait disabled:opacity-60"
                        title="Excluir marca definitivamente"
                        aria-label={`Excluir marca ${b.name}`}
                      >
                        {deletingBrandId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Produtos */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Plus} title="Produtos" subtitle="Cadastro e edição de produtos" />
              {!editingProductId && (
                <div className="mb-6 p-4 bg-secondary/50 border border-dashed border-accent rounded-xl space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <label className="text-[10px] text-accent uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
                        <Sparkles size={12} /> Cadastro Massivo Universal
                      </label>
                      <p className="text-[10px] text-muted-foreground mt-1">Cole uma URL de categoria de qualquer marca e escolha ou digite a marca destino para criar ou atualizar os produtos encontrados.</p>
                    </div>
                    {bulkImportSummary && (
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground whitespace-nowrap">
                        {bulkImportSummary.found} encontrados
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={bulkImportBrandId}
                      onChange={e => {
                        setBulkImportBrandId(e.target.value);
                        if (e.target.value) setBulkImportBrandName('');
                      }}
                      disabled={isBulkImportingCentury}
                      className="sm:w-56 p-3 bg-background border border-border rounded-lg text-sm text-foreground"
                    >
                      <option value="">Marca nova / automática</option>
                      {brands.map(brand => (
                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                      ))}
                    </select>
                    {!bulkImportBrandId && (
                      <input
                        placeholder="Nome da marca (ex: Folio)"
                        className="sm:w-56 p-3 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                        value={bulkImportBrandName}
                        onChange={e => setBulkImportBrandName(e.target.value)}
                        disabled={isBulkImportingCentury}
                      />
                    )}
                    <input
                      placeholder="https://site-da-marca.com/categoria/produtos/"
                      className="flex-1 p-3 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                      value={centuryCategoryUrl}
                      onChange={e => setCenturyCategoryUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleBulkImportCentury())}
                      disabled={isBulkImportingCentury}
                    />
                    <button
                      type="button"
                      onClick={handleBulkImportCentury}
                      disabled={isBulkImportingCentury || !centuryCategoryUrl.trim()}
                      className="px-5 py-3 bg-primary text-primary-foreground rounded-lg text-xs uppercase tracking-[0.1em] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isBulkImportingCentury ? <><Loader2 size={14} className="animate-spin" /> Importando...</> : 'Importar categoria'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
                        Categoria dos produtos
                      </label>
                      <select
                        value={selectedBulkCategoryId}
                        onChange={e => setSelectedBulkCategoryId(e.target.value)}
                        disabled={isBulkImportingCentury}
                        className="w-full p-3 bg-background border border-border rounded-lg text-sm text-foreground"
                      >
                        <option value="">Automática</option>
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
                        Ambientes da categoria
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        {selectedBulkEnvironmentIds.length > 0 ? `${selectedBulkEnvironmentIds.length}/2 selecionados` : 'Automático'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {environmentsList.map(env => {
                        const selected = selectedBulkEnvironmentIds.includes(env.id);
                        return (
                          <button
                            key={env.id}
                            type="button"
                            onClick={() => {
                              setSelectedBulkEnvironmentIds(prev => {
                                if (prev.includes(env.id)) return prev.filter(id => id !== env.id);
                                return prev.length >= 2 ? [prev[1], env.id] : [...prev, env.id];
                              });
                            }}
                            disabled={isBulkImportingCentury}
                            className={`px-3 py-2 rounded-lg border text-[10px] uppercase tracking-[0.1em] transition-colors ${
                              selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {env.name}
                          </button>
                        );
                      })}
                      {selectedBulkEnvironmentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedBulkEnvironmentIds([])}
                          disabled={isBulkImportingCentury}
                          className="px-3 py-2 rounded-lg border border-border bg-background text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
                        >
                          Automático
                        </button>
                      )}
                    </div>
                  </div>
                  {bulkImportSummary && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Encontrados</span>{bulkImportSummary.found}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Criados</span>{bulkImportSummary.created}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Atualizados</span>{bulkImportSummary.updated}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Falhas</span>{bulkImportSummary.failed}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Sem 5 fotos</span>{bulkImportSummary.productsWithoutFiveImages}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Sem 2D/3D</span>{bulkImportSummary.productsWithout2d}/{bulkImportSummary.productsWithout3d}</div>
                      </div>
                      {bulkImportSummary.sourceRateLimited && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                          {bulkImportSummary.message || 'O site de origem bloqueou temporariamente a leitura. A importacao esta pausada e vai repetir o mesmo produto automaticamente.'}
                        </div>
                      )}
                      <div className="max-h-56 overflow-y-auto space-y-2">
                        {bulkImportSummary.products.map((product) => (
                          <div key={product.url} className="p-3 bg-background rounded-lg border border-border text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-foreground">{product.name}</span>
                              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                {product.error ? 'Falha' : product.action === 'created' ? 'Criado' : 'Atualizado'}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              categoria {product.categoryName || '-'} | {product.imageCount} fotos | ambientadas {product.ambientImageCount || 0} | ambientes {product.environmentNames?.length ? product.environmentNames.join(', ') : product.environmentCount || 0} | estilos {product.styleCount || 0} | 2D {product.downloads.file2d ? 'ok' : 'faltando'} | 3D {product.downloads.threeDCount || 0} | ficha {product.downloads.techSheet ? 'ok' : 'faltando'}
                            </div>
                            {(product.error || product.warnings.length > 0) && (
                              <div className="mt-1 text-[10px] text-destructive">
                                {product.error || product.warnings.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Cadastro Rápido por URL */}
              {!editingProductId && (
                <div className="mb-6 p-4 bg-secondary/50 border border-dashed border-accent rounded-xl space-y-3">
                  <label className="text-[10px] text-accent uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
                    <Link size={12} /> Cadastro Rápido — Cole o link do produto
                  </label>
                  <div className="flex gap-2">
                    <input
                      placeholder="https://fabricante.com.br/produto/nome-do-produto"
                      className="flex-1 p-3 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                      value={importUrl}
                      onChange={e => setImportUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleImportProduct())}
                      disabled={isImporting}
                    />
                    <button
                      type="button"
                      onClick={handleImportProduct}
                      disabled={isImporting || !importUrl.trim()}
                      className="px-5 bg-accent text-accent-foreground rounded-lg text-xs uppercase tracking-[0.1em] font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      {isImporting ? <><Loader2 size={14} className="animate-spin" /> Importando...</> : <><Sparkles size={14} /> Importar</>}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">A IA vai extrair nome, marca, descrição, categoria e fotos automaticamente. Depois é só completar com os blocos 3D/2D.</p>
                </div>
              )}
              {editingProductId && (
                <button onClick={cancelEdit} className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"><X size={12} /> Cancelar edição</button>
              )}
              <form onSubmit={handleSaveProduct} className="space-y-4">
                <input required placeholder="Nome do Produto"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
                 <div className="space-y-2">
                   <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Fotos (até 8) — arraste para reordenar. A 1ª é a principal.</label>
                   <DndContext
                     sensors={sensors}
                     collisionDetection={closestCenter}
                     onDragEnd={(event: DragEndEvent) => {
                       const { active, over } = event;
                       if (!over || active.id === over.id) return;
                       const oldIndex = newProduct.images.findIndex((_, idx) => `img-${idx}` === active.id);
                       const newIndex = newProduct.images.findIndex((_, idx) => `img-${idx}` === over.id);
                       if (oldIndex < 0 || newIndex < 0) return;
                       setNewProduct({ ...newProduct, images: arrayMove(newProduct.images, oldIndex, newIndex) });
                     }}
                   >
                     <SortableContext items={newProduct.images.map((_, idx) => `img-${idx}`)} strategy={rectSortingStrategy}>
                       <div className="grid grid-cols-5 gap-2">
                         {newProduct.images.map((src, i) => (
                           <SortableImageSlot
                             key={`img-${i}`}
                             id={`img-${i}`}
                             index={i}
                             src={src}
                             onRemove={() => {
                               const imgs = [...newProduct.images];
                               imgs.splice(i, 1);
                               setNewProduct({ ...newProduct, images: imgs });
                             }}
                           />
                         ))}
                         {Array.from({ length: Math.max(0, 5 - newProduct.images.length) }).map((_, k) => (
                           <div key={`empty-${k}`} className="aspect-square bg-secondary border-2 border-dashed border-border rounded-lg relative flex items-center justify-center overflow-hidden">
                             <label className="cursor-pointer p-2 text-center w-full h-full flex items-center justify-center">
                               <ImageIcon size={16} className="mx-auto text-muted-foreground" />
                               <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'productImages')} />
                             </label>
                           </div>
                         ))}
                       </div>
                     </SortableContext>
                   </DndContext>
                 </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
                    Fotos ambientadas (opcional) - aparecem no carrossel da pagina do produto
                  </label>
                    <div className="grid grid-cols-3 gap-2">
                    {newProduct.ambientImages.map((src, i) => (
                      <div key={`ambient-${i}`} className="group relative aspect-[4/3] bg-secondary border border-border rounded-lg overflow-hidden">
                        <img src={src} alt={`Foto ambientada ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const imgs = [...newProduct.ambientImages];
                            imgs.splice(i, 1);
                            setNewProduct({ ...newProduct, ambientImages: imgs });
                          }}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remover foto ambientada"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {newProduct.ambientImages.length < AMBIENT_IMAGE_LIMIT && (
                      <div className="aspect-[4/3] bg-secondary border-2 border-dashed border-border rounded-lg relative flex items-center justify-center overflow-hidden">
                        <label className="cursor-pointer p-2 text-center w-full h-full flex flex-col items-center justify-center gap-1">
                          <ImageIcon size={16} className="mx-auto text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground uppercase tracking-[0.08em]">Adicionar</span>
                          <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'ambientImages')} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                <select required className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground"
                  value={newProduct.brandId} onChange={e => setNewProduct({ ...newProduct, brandId: e.target.value })}>
                  <option value="">Selecione a Marca</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select required className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground"
                  value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}>
                  <option value="">Selecione a Categoria</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Designer (assina a peça) — opcional</label>
                  <select className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground"
                    value={newProduct.designerId} onChange={e => setNewProduct({ ...newProduct, designerId: e.target.value })}>
                    <option value="">Sem designer</option>
                    {productDesigners.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Tags de Estilo</label>
                  <div className="flex flex-wrap gap-2 border border-border rounded-lg p-3 bg-secondary">
                    {styleTags.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma tag cadastrada</p>}
                    {styleTags.map(tag => (
                      <button key={tag.id} type="button"
                        onClick={() => setSelectedProductStyles(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                        className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
                          selectedProductStyles.includes(tag.id)
                            ? 'bg-accent text-accent-foreground border-accent'
                            : 'bg-card text-muted-foreground border-border hover:border-accent'
                        }`}>
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Ambientes</label>
                  <div className="flex flex-wrap gap-2 border border-border rounded-lg p-3 bg-secondary">
                    {environmentsList.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum ambiente cadastrado</p>}
                    {environmentsList.map(env => (
                      <button key={env.id} type="button"
                        onClick={() => setSelectedProductEnvs(prev => prev.includes(env.id) ? prev.filter(id => id !== env.id) : [...prev, env.id])}
                        className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
                          selectedProductEnvs.includes(env.id)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-muted-foreground border-border hover:border-primary'
                        }`}>
                        {env.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Composição sugerida</label>
                    <span className="text-[10px] text-muted-foreground">{selectedCompositionProductIds.length}/4 produtos</span>
                  </div>
                  <div className="border border-border rounded-lg p-3 bg-secondary space-y-3">
                    {selectedCompositionProducts.length > 0 ? (
                      <div className="space-y-2">
                        {selectedCompositionProducts.map((item, index) => (
                          <div key={item.id} className="flex items-center gap-3 rounded-lg bg-card border border-border p-2">
                            <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-[10px] flex items-center justify-center shrink-0">{index + 1}</span>
                            <img
                              src={item.images?.[0] || '/placeholder.svg'}
                              alt=""
                              className="w-10 h-10 rounded-md bg-muted object-contain border border-border shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-foreground truncate">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {brands.find(brand => brand.id === item.brand_id)?.name} · {item.category}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedCompositionProductIds(prev => prev.filter(id => id !== item.id))}
                              className="p-1 text-muted-foreground hover:text-destructive"
                              aria-label={`Remover ${item.name} da composição`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nenhum produto anexado. A página usará sugestões automáticas aleatórias.</p>
                    )}

                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        placeholder={selectedCompositionProductIds.length >= 4 ? 'Limite de 4 produtos atingido' : 'Buscar produto para anexar...'}
                        value={compositionProductSearch}
                        onChange={e => setCompositionProductSearch(e.target.value)}
                        disabled={selectedCompositionProductIds.length >= 4}
                        className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-60"
                      />
                    </div>

                    {compositionProductOptions.length > 0 && selectedCompositionProductIds.length < 4 && (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
                        {compositionProductOptions.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedCompositionProductIds(prev => prev.length >= 4 || prev.includes(item.id) ? prev : [...prev, item.id]);
                              setCompositionProductSearch('');
                            }}
                            className="w-full flex items-center gap-3 p-2 text-left hover:bg-secondary transition-colors"
                          >
                            <img
                              src={item.images?.[0] || '/placeholder.svg'}
                              alt=""
                              className="w-9 h-9 rounded-md bg-muted object-contain border border-border shrink-0"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs text-foreground truncate">{item.name}</span>
                              <span className="block text-[10px] text-muted-foreground truncate">
                                {brands.find(brand => brand.id === item.brand_id)?.name} · {item.category}
                              </span>
                            </span>
                            <Plus size={12} className="text-accent shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Acabamentos do produto */}
                {newProduct.brandId && (
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Acabamentos visíveis neste produto</label>
                    <div className="flex flex-wrap gap-2 border border-border rounded-lg p-3 bg-secondary">
                      {(() => {
                        const brandFCats = finishCategories.filter(fc => fc.brand_id === newProduct.brandId);
                        if (brandFCats.length === 0) return <p className="text-xs text-muted-foreground italic">Nenhuma categoria de acabamento para esta marca</p>;
                        return brandFCats.map(fc => (
                          <button key={fc.id} type="button"
                            onClick={() => setSelectedProductFinishCats(prev => prev.includes(fc.id) ? prev.filter(id => id !== fc.id) : [...prev, fc.id])}
                            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
                              selectedProductFinishCats.includes(fc.id)
                                ? 'bg-accent text-accent-foreground border-accent'
                                : 'bg-card text-muted-foreground border-border hover:border-accent'
                            }`}>
                            {fc.name}
                          </button>
                        ));
                      })()}
                    </div>
                    {selectedProductFinishCats.length === 0 && <p className="text-[10px] text-muted-foreground">Nenhuma selecionada = todos os acabamentos da marca visíveis</p>}
                  </div>
                )}
                <textarea placeholder="Descrição (opcional)"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm h-20 text-foreground placeholder:text-muted-foreground"
                  value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <input placeholder="Link Bloco 3D" className="w-full p-2 bg-secondary border border-border rounded-lg text-[10px] text-foreground placeholder:text-muted-foreground" value={newProduct.file3d} onChange={e => setNewProduct({ ...newProduct, file3d: e.target.value })} />
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] text-accent hover:underline">
                      <Plus size={10} /> Upload .SKP
                      <input type="file" accept=".skp" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await uploadToStorage(file, 'blocos-3d');
                          setNewProduct(prev => ({ ...prev, file3d: url }));
                        } catch (err: any) { alert(err.message); }
                      }} />
                    </label>
                  </div>
                  <input placeholder="Link Bloco 2D" className="p-2 bg-secondary border border-border rounded-lg text-[10px] text-foreground placeholder:text-muted-foreground" value={newProduct.file2d} onChange={e => setNewProduct({ ...newProduct, file2d: e.target.value })} />
                  <div className="space-y-1">
                    <input placeholder="Link Ficha Técnica" className="w-full p-2 bg-secondary border border-border rounded-lg text-[10px] text-foreground placeholder:text-muted-foreground" value={newProduct.techSheet} onChange={e => setNewProduct({ ...newProduct, techSheet: e.target.value })} />
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] text-accent hover:underline">
                      <Plus size={10} /> Upload PDF
                      <input type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await uploadToStorage(file, 'fichas-tecnicas');
                          setNewProduct(prev => ({ ...prev, techSheet: url }));
                        } catch (err: any) { alert(err.message); }
                      }} />
                    </label>
                  </div>
                  <input placeholder="Link Acabamentos" className="p-2 bg-secondary border border-border rounded-lg text-[10px] text-foreground placeholder:text-muted-foreground" value={newProduct.finishLink} onChange={e => setNewProduct({ ...newProduct, finishLink: e.target.value })} />
                </div>
                <button className="w-full bg-primary text-primary-foreground p-3 rounded-lg text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2">
                  {editingProductId ? <><Save size={14} /> Atualizar Produto</> : 'Salvar Produto'}
                </button>
              </form>
              <div className="mt-6 space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input placeholder="Buscar produto..." value={productSearch} onChange={e => setProductSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground" />
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredProducts.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum produto encontrado</p>}
                  {filteredProducts.map(p => (
                    <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg ${p.is_hidden ? 'bg-muted/70 border border-dashed border-muted-foreground/30' : 'bg-secondary'}`}>
                      <div className="flex flex-col min-w-0 flex-1 mr-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`text-sm truncate ${p.is_hidden ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{p.name}</span>
                          {p.is_hidden && (
                            <span className="shrink-0 rounded-full border border-muted-foreground/30 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                              Oculto
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">{brands.find(b => b.id === p.brand_id)?.name}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={() => startEditProduct(p)} className="text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                        <button
                          type="button"
                          onClick={() => void toggleProductHidden(p)}
                          className={p.is_hidden ? 'text-accent hover:text-foreground' : 'text-muted-foreground hover:text-foreground'}
                          title={p.is_hidden ? 'Mostrar produto no catalogo' : 'Ocultar produto do catalogo'}
                          aria-label={p.is_hidden ? `Mostrar produto ${p.name}` : `Ocultar produto ${p.name}`}
                        >
                          {p.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProduct(p.id)}
                          disabled={deletingProductId === p.id}
                          className="text-destructive disabled:cursor-wait disabled:opacity-60"
                          title="Excluir produto definitivamente"
                          aria-label={`Excluir produto ${p.name}`}
                        >
                          {deletingProductId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card p-6 md:p-8 rounded-2xl border border-border mt-8">
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-[0.22em] text-accent">Coleção YLEON</span>
                <h3 className="text-xl font-serif text-foreground mt-1">Seleções prontas</h3>
                <p className="text-xs text-muted-foreground mt-1">Crie uma seleção, adicione produtos e salve.</p>
              </div>
            </div>
            {editingCuratedCollectionId && (
              <button onClick={cancelEditCuratedCollection} className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"><X size={12} /> Cancelar edição</button>
            )}

            <form onSubmit={handleSaveCuratedCollection} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                <input
                  required
                  placeholder="Nome da seleção. Ex: Linha alto padrão"
                  value={newCuratedCollection.title}
                  onChange={e => setNewCuratedCollection({ ...newCuratedCollection, title: e.target.value })}
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                />
                <input
                  type="number"
                  placeholder="Ordem"
                  value={newCuratedCollection.displayOrder}
                  onChange={e => setNewCuratedCollection({ ...newCuratedCollection, displayOrder: Number(e.target.value) })}
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <textarea
                placeholder="Descrição editorial da seleção"
                value={newCuratedCollection.description}
                onChange={e => setNewCuratedCollection({ ...newCuratedCollection, description: e.target.value })}
                className="w-full p-3 bg-secondary border border-border rounded-lg text-sm h-20 text-foreground placeholder:text-muted-foreground"
              />
              <details className="rounded-lg border border-border bg-secondary p-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">Opções avançadas</summary>
                <div className="mt-3 space-y-3">
                  <input
                    placeholder="Imagem de capa opcional"
                    value={newCuratedCollection.coverImage}
                    onChange={e => setNewCuratedCollection({ ...newCuratedCollection, coverImage: e.target.value })}
                    className="w-full p-3 bg-card border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCuratedCollection.isActive}
                      onChange={e => setNewCuratedCollection({ ...newCuratedCollection, isActive: e.target.checked })}
                      className="accent-primary"
                    />
                    Exibir na página Coleção
                  </label>
                </div>
              </details>

              <div className="border border-border rounded-lg p-3 bg-secondary space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Produtos da seleção</label>
                  <span className="text-[10px] text-muted-foreground">{selectedCuratedProductIds.length} produtos</span>
                </div>

                {selectedCuratedProducts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedCuratedProducts.map((item, index) => (
                      <div key={item.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-2 pr-1">
                        <span className="text-[10px] text-accent">{index + 1}</span>
                        <span className="max-w-[220px] truncate text-xs text-foreground">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedCuratedProductIds(prev => prev.filter(id => id !== item.id))}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Remover ${item.name}`}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Nenhum produto selecionado.</p>
                )}

                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Buscar produto para adicionar..."
                    value={curatedProductSearch}
                    onChange={e => setCuratedProductSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {curatedProductOptions.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
                    {curatedProductOptions.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedCuratedProductIds(prev => prev.includes(item.id) ? prev : [...prev, item.id]);
                          setCuratedProductSearch('');
                        }}
                        className="w-full flex items-center gap-3 p-2 text-left hover:bg-secondary transition-colors"
                      >
                        <img
                          src={item.ambient_images?.[0] || item.images?.[0] || '/placeholder.svg'}
                          alt=""
                          className="w-10 h-9 rounded-md bg-muted object-cover border border-border shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-foreground truncate">{item.name}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {brands.find(brand => brand.id === item.brand_id)?.name} · {item.category}
                          </span>
                        </span>
                        <Plus size={12} className="text-accent shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className="w-full bg-primary text-primary-foreground p-3 rounded-lg text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2">
                {editingCuratedCollectionId ? <><Save size={14} /> Atualizar seleção</> : <><Sparkles size={14} /> Salvar seleção</>}
              </button>
            </form>

            <div className="mt-6 rounded-lg border border-border bg-secondary p-3">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-[0.16em] text-foreground">Seleções cadastradas</h4>
                <span className="text-[10px] text-muted-foreground">{curatedCollections.length}</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
              {curatedCollections.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Nenhuma seleção cadastrada</p>}
              {curatedCollections.map(collection => {
                const total = curatedCollectionProducts.filter(item => item.collection_id === collection.id).length;
                return (
                  <div key={collection.id} className="flex justify-between items-center p-3 bg-card border border-border rounded-lg">
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground truncate">{collection.title}</span>
                        {!collection.is_active && <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">oculta</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate block">{total} produtos - ordem {collection.display_order}</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEditCuratedCollection(collection)} className="text-muted-foreground hover:text-foreground" aria-label={`Editar ${collection.title}`}><Pencil size={14} /></button>
                      <button onClick={() => deleteCuratedCollection(collection.id)} className="text-destructive" aria-label={`Excluir ${collection.title}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* Categorias + Tags de Estilo + Ambientes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
            {/* Categorias */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Plus} title="Categorias" subtitle="Tipos de produtos disponíveis" />
              <div className="flex gap-2 mb-6">
                <input placeholder="Nova categoria..." value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  onKeyDown={e => e.key === 'Enter' && addCategory()} />
                <button onClick={addCategory} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs"><Plus size={16} /></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {categories.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-sm text-foreground">{c.name}</span>
                    <button onClick={() => deleteCategory(c.id)} className="text-destructive"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags de Estilo */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Tag} title="Tags de Estilo" subtitle="Estilos de design para produtos" />
              <div className="flex gap-2 mb-6">
                <input placeholder="Nova tag de estilo..." value={newStyleTag} onChange={e => setNewStyleTag(e.target.value)}
                  className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  onKeyDown={e => e.key === 'Enter' && addStyleTag()} />
                <button onClick={addStyleTag} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs"><Plus size={16} /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {styleTags.map(tag => (
                  <div key={tag.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border rounded-full group">
                    <span className="text-xs text-foreground">{tag.name}</span>
                    <button onClick={() => deleteStyleTag(tag.id)} className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                  </div>
                ))}
              </div>
              {styleTags.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Nenhuma tag de estilo cadastrada.</p>}
            </div>

            {/* Ambientes */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Home} title="Ambientes" subtitle="Ambientes para filtro de produtos" />
              <div className="flex gap-2 mb-6">
                <input placeholder="Novo ambiente..." value={newEnvironmentName} onChange={e => setNewEnvironmentName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  onKeyDown={e => e.key === 'Enter' && addEnvironment()} />
                <button onClick={addEnvironment} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs"><Plus size={16} /></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {environmentsList.map(env => (
                  <div key={env.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-sm text-foreground">{env.name}</span>
                    <button onClick={() => deleteEnvironment(env.id)} className="text-destructive"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              {environmentsList.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum ambiente cadastrado.</p>}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 2: CATÁLOGO */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1.5 rounded-full">Seção 2</span>
            <h2 className="text-2xl font-serif text-foreground">Catálogo</h2>
          </div>

          <div className="bg-card p-8 rounded-2xl border border-border">
            <SectionHeader icon={Sparkles} title="Produtos em Destaque" subtitle="Selecione até 3 produtos para exibição privilegiada no catálogo" />
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {products.map(p => {
                const isFeatured = featuredProductIds.has(p.id);
                return (
                  <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg transition-colors ${isFeatured ? 'bg-accent/10 border border-accent/30' : 'bg-secondary'}`}>
                    <div className="flex flex-col min-w-0 flex-1 mr-2">
                      <span className="text-sm text-foreground truncate">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{brands.find(b => b.id === p.brand_id)?.name}</span>
                    </div>
                    <button
                      onClick={() => toggleFeaturedProduct(p.id)}
                      disabled={!isFeatured && featuredProducts.length >= 4}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.1em] border transition-colors disabled:opacity-40 ${
                        isFeatured
                          ? 'bg-accent text-accent-foreground border-accent'
                          : 'bg-card text-muted-foreground border-border hover:border-accent hover:text-accent'
                      }`}
                    >
                      {isFeatured ? <><Sparkles size={10} className="inline mr-1" />Destaque</> : 'Destacar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 3: PÁGINA ACERVO */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1.5 rounded-full">Seção 3</span>
            <h2 className="text-2xl font-serif text-foreground">Página YLEON</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Imagens da Página Inicial */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={ImageIcon} title="Imagens da Página Inicial" subtitle="Imagens do carrossel e galeria" />
              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Upload de Imagem ou Cole URL</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-xs text-foreground" />
                  <input
                    placeholder="Ou cole a URL da imagem..."
                    className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                    value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)}
                  />
                  {newImageUrl && <img src={newImageUrl} className="h-20 object-cover rounded" alt="" />}
                </div>
                <button onClick={addLandingImage} disabled={!newImageUrl.trim()}
                  className="w-full bg-primary text-primary-foreground p-3 rounded-lg text-xs uppercase tracking-[0.15em] disabled:opacity-50">
                  Adicionar Imagem
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {landingImages.map(li => (
                  <div key={li.id} className="relative group aspect-square">
                    <img src={li.image_url} className="w-full h-full object-cover rounded-lg" alt="" />
                    <button onClick={() => deleteLandingImage(li.id)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
              {landingImages.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-4">
                  Nenhuma imagem adicionada. Imagens padrão serão usadas.
                </p>
              )}
            </div>

            {/* Designers em Destaque */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Star} title="Designers em Destaque" subtitle="Máximo de 2 designers" />
              <form onSubmit={handleSaveDesigner} className="space-y-4 mb-6">
                <input
                  required placeholder="Nome do Designer"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  value={editingDesigner.name} onChange={e => setEditingDesigner({ ...editingDesigner, name: e.target.value })}
                />
                <textarea
                  placeholder="Descrição"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm h-20 text-foreground placeholder:text-muted-foreground"
                  value={editingDesigner.description} onChange={e => setEditingDesigner({ ...editingDesigner, description: e.target.value })}
                />
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Foto do Designer</label>
                  <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'designerPhoto')} className="w-full text-xs text-foreground" />
                  {editingDesigner.photo_url && <img src={editingDesigner.photo_url} className="h-20 object-cover rounded" alt="" />}
                </div>
                {editingDesignerId && (
                  <button type="button" onClick={() => { setEditingDesignerId(null); setEditingDesigner({ name: '', description: '', photo_url: '' }); }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><X size={12} /> Cancelar</button>
                )}
                <button
                  disabled={designers.length >= 2 && !editingDesignerId}
                  className="w-full bg-primary text-primary-foreground p-3 rounded-lg text-xs uppercase tracking-[0.15em] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {editingDesignerId ? <><Save size={14} /> Atualizar</> : 'Adicionar Designer'}
                </button>
              </form>
              <div className="space-y-2">
                {designers.map(d => (
                  <div key={d.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <div className="flex items-center gap-3">
                      {d.photo_url && <img src={d.photo_url} className="w-10 h-10 rounded-full object-cover" alt="" />}
                      <span className="text-sm text-foreground">{d.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditDesigner(d)} className="text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      <button onClick={() => deleteDesigner(d.id)} className="text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Designers de Produtos (assina a peça) */}
          <div className="bg-card p-8 rounded-2xl border border-border mt-8">
            <SectionHeader icon={UserCheck} title="Designers de Produtos" subtitle="Assinam as peças do catálogo" />
            <form onSubmit={handleSavePDesigner} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-3">
                <input
                  required placeholder="Nome do Designer"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                  value={editingPDesigner.name} onChange={e => setEditingPDesigner({ ...editingPDesigner, name: e.target.value })}
                />
                <textarea
                  placeholder="História / biografia"
                  className="w-full p-3 bg-secondary border border-border rounded-lg text-sm h-32 text-foreground placeholder:text-muted-foreground"
                  value={editingPDesigner.bio} onChange={e => setEditingPDesigner({ ...editingPDesigner, bio: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Foto de Perfil</label>
                <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'pDesignerPhoto')} className="w-full text-xs text-foreground" />
                {editingPDesigner.photo_url && <img src={editingPDesigner.photo_url} className="h-28 w-28 rounded-full object-cover" alt="" />}
                <div className="flex gap-2">
                  {editingPDesignerId && (
                    <button type="button" onClick={() => { setEditingPDesignerId(null); setEditingPDesigner({ name: '', bio: '', photo_url: '' }); }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><X size={12} /> Cancelar</button>
                  )}
                  <button className="ml-auto bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-xs uppercase tracking-[0.15em] flex items-center gap-2">
                    {editingPDesignerId ? <><Save size={14} /> Atualizar</> : 'Adicionar Designer'}
                  </button>
                </div>
              </div>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {productDesigners.length === 0 && (
                <p className="text-xs text-muted-foreground italic col-span-full">Nenhum designer cadastrado.</p>
              )}
              {productDesigners.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                  {d.photo_url ? (
                    <img src={d.photo_url} className="w-12 h-12 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground"><UserCheck size={18} /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{d.name}</p>
                    {d.bio && <p className="text-[10px] text-muted-foreground truncate">{d.bio}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditPDesigner(d)} className="text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                    <button onClick={() => deletePDesigner(d.id)} className="text-destructive"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 4: USUÁRIOS */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1.5 rounded-full">Seção 4</span>
            <h2 className="text-2xl font-serif text-foreground">Usuários</h2>
          </div>

          <div className="bg-card p-8 rounded-2xl border border-border mb-8">
            <SectionHeader icon={UserCheck} title="Cadastrar usuario" subtitle="Crie acessos aprovados para CEO, gerente, financeiro, vendedor e arquiteto" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={newSeller.fullName}
                onChange={(event) => setNewSeller(prev => ({ ...prev, fullName: event.target.value }))}
                placeholder="Nome completo"
                className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
              />
              <input
                type="email"
                value={newSeller.email}
                onChange={(event) => setNewSeller(prev => ({ ...prev, email: event.target.value }))}
                placeholder="Email de acesso"
                className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
              />
              <input
                type="text"
                value={newSeller.password}
                onChange={(event) => setNewSeller(prev => ({ ...prev, password: event.target.value }))}
                placeholder="Senha provisoria"
                className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
              />
              <select
                value={newSeller.role}
                onChange={(event) => setNewSeller(prev => ({ ...prev, role: event.target.value as AdminAssignableRole }))}
                className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
              >
                {ADMIN_ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {ADMIN_ROLE_OPTIONS.find(option => option.value === newSeller.role)?.description}
            </p>
            {newSeller.role === 'arquiteto' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={newSeller.phone}
                  onChange={(event) => setNewSeller(prev => ({ ...prev, phone: event.target.value }))}
                  placeholder="Telefone"
                  className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
                />
                <input
                  value={newSeller.officeName}
                  onChange={(event) => setNewSeller(prev => ({ ...prev, officeName: event.target.value }))}
                  placeholder="Escritorio (opcional)"
                  className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
                />
                <select
                  value={newSeller.sellerId}
                  onChange={(event) => setNewSeller(prev => ({ ...prev, sellerId: event.target.value }))}
                  className="px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground"
                >
                  <option value="">Vendedor responsavel</option>
                  {sellerUsers.map(seller => (
                    <option key={seller.user_id} value={seller.user_id}>{seller.full_name || 'Vendedor'}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={newSeller.active}
                onChange={(event) => setNewSeller(prev => ({ ...prev, active: event.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              Usuario ativo
            </label>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={createSeller}
                disabled={isCreatingSeller}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[10px] uppercase tracking-[0.14em] font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isCreatingSeller ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {isCreatingSeller ? 'Cadastrando' : 'Cadastrar usuario'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pendentes */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Clock} title="Cadastros Pendentes" subtitle="Solicitações aguardando aprovação" />
              {pendingUsers.length === 0 ? (
                <div className="text-center py-8">
                  <UserCheck size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground italic">Nenhum cadastro pendente.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {pendingUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 bg-accent/5 border border-accent/20 rounded-xl animate-fade-in">
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="text-sm font-medium text-foreground truncate">{u.full_name || 'Sem nome'}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Solicitado em {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {u.seller_id && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Vendedor: <span className="text-foreground">{sellerNameMap.get(u.seller_id) || 'Nao encontrado'}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => approveUser(u.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/10 text-green-600 border border-green-600/20 rounded-lg text-[10px] uppercase tracking-[0.1em] font-medium hover:bg-green-600/20 transition-colors"
                        >
                          <UserCheck size={12} /> Aprovar
                        </button>
                        <button
                          onClick={() => deleteUserPermanently(u.user_id)}
                          disabled={deletingUserId === u.user_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg text-[10px] uppercase tracking-[0.1em] font-medium hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {deletingUserId === u.user_id ? <Loader2 size={12} className="animate-spin" /> : <UserX size={12} />}
                          Recusar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Aprovados */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <SectionHeader icon={Users} title="Usuários Aprovados" subtitle="Lista de todos os usuários com acesso" />
              {approvedUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-8">Nenhum usuário aprovado.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {approvedUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between gap-3 p-3 bg-secondary rounded-lg">
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="text-sm text-foreground truncate">{u.full_name || 'Sem nome'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Desde {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {(getPrimaryRole(u.user_id) === 'user' || getPrimaryRole(u.user_id) === 'arquiteto') && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <label className="block">
                              <span className="sr-only">Vendedor responsavel</span>
                              <select
                                value={u.seller_id || ''}
                                onChange={(event) => updateUserSeller(u.user_id, event.target.value)}
                                className="w-full max-w-xs px-2 py-1.5 bg-background border border-border rounded-md text-[11px] text-foreground"
                              >
                                <option value="">Sem vendedor</option>
                                {sellerUsers.map(seller => (
                                  <option key={seller.user_id} value={seller.user_id}>
                                    {seller.full_name || 'Vendedor'}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="sr-only">Data de nascimento</span>
                              <input
                                type="date"
                                value={u.birth_date || ''}
                                onChange={(event) => updateUserBirthDate(u.user_id, event.target.value)}
                                className="w-full max-w-xs px-2 py-1.5 bg-background border border-border rounded-md text-[11px] text-foreground"
                                title="Data de nascimento do arquiteto"
                              />
                            </label>
                            <label className="block">
                              <span className="sr-only">Telefone</span>
                              <input
                                type="text"
                                defaultValue={u.phone || ''}
                                onBlur={(event) => updateUserProfileField(u.user_id, 'phone', event.target.value)}
                                className="w-full max-w-xs px-2 py-1.5 bg-background border border-border rounded-md text-[11px] text-foreground"
                                placeholder="Telefone"
                              />
                            </label>
                            <label className="block">
                              <span className="sr-only">Escritorio</span>
                              <input
                                type="text"
                                defaultValue={u.office_name || ''}
                                onBlur={(event) => updateUserProfileField(u.user_id, 'office_name', event.target.value)}
                                className="w-full max-w-xs px-2 py-1.5 bg-background border border-border rounded-md text-[11px] text-foreground"
                                placeholder="Escritorio"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={() => updateUserProfileField(u.user_id, 'is_active', u.is_active === false)}
                          className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 ${
                            u.is_active === false
                              ? 'text-muted-foreground bg-muted'
                              : 'text-green-600 bg-green-600/10'
                          }`}
                        >
                          <Check size={10} /> {u.is_active === false ? 'Inativo' : 'Ativo'}
                        </button>
                        <span className="text-[10px] text-accent bg-accent/10 px-2 py-1 rounded-full uppercase tracking-[0.08em]">
                          {roleLabel(getPrimaryRole(u.user_id))}
                        </span>
                        {getPrimaryRole(u.user_id) === 'vendedor' && (
                          <button
                            onClick={() => demoteSeller(u.user_id)}
                            className="text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1"
                          >
                            Remover vendedor
                          </button>
                        )}
                        <button
                          onClick={() => deleteUserPermanently(u.user_id)}
                          disabled={deletingUserId === u.user_id || user?.id === u.user_id}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title="Excluir definitivamente"
                        >
                          {deletingUserId === u.user_id ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SEÇÃO 5: ACABAMENTOS */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-primary/10 px-3 py-1.5 rounded-full">Seção 5</span>
            <h2 className="text-2xl font-serif text-foreground">Acabamentos</h2>
          </div>

          <div className="bg-card p-8 rounded-2xl border border-border">
            <SectionHeader icon={Palette} title="Acabamentos por Marca" subtitle="Gerencie categorias e itens de acabamento de cada marca" />

            {/* Brand selector */}
            <select
              className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground mb-6"
              value={selectedFinishBrand}
              onChange={e => { setSelectedFinishBrand(e.target.value); setSelectedFinishCategory(''); }}
            >
              <option value="">Selecione uma marca</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            {selectedFinishBrand && (
              <div className="space-y-8">
                <div className="p-4 bg-secondary/50 border border-dashed border-accent rounded-xl space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <label className="text-[10px] text-accent uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
                        <Sparkles size={12} /> Importar Acabamentos Universal
                      </label>
                      <p className="text-[10px] text-muted-foreground mt-1">Cole uma URL com amostras, tecidos, cores ou materiais de qualquer marca. A importacao cria categorias, baixa as imagens e atualiza itens existentes pelo nome.</p>
                    </div>
                    {finishImportSummary && (
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground whitespace-nowrap">
                        {finishImportSummary.finishesFound} encontrados
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        placeholder="https://site-da-marca.com/acabamentos/"
                        className="w-full pl-9 pr-3 py-3 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                        value={centuryFinishUrl}
                        onChange={e => setCenturyFinishUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleImportCenturyFinishes())}
                        disabled={isImportingCenturyFinishes}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleImportCenturyFinishes}
                      disabled={isImportingCenturyFinishes || !centuryFinishUrl.trim()}
                      className="px-5 py-3 bg-primary text-primary-foreground rounded-lg text-xs uppercase tracking-[0.1em] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isImportingCenturyFinishes ? <><Loader2 size={14} className="animate-spin" /> Importando...</> : 'Importar acabamentos'}
                    </button>
                  </div>

                  {finishImportSummary && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Categorias</span>{finishImportSummary.categoriesFound}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Amostras</span>{finishImportSummary.finishesFound}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Cat. novas</span>{finishImportSummary.categoriesCreated}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Cat. existentes</span>{finishImportSummary.categoriesExisting}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Criados</span>{finishImportSummary.finishesCreated}</div>
                        <div className="p-3 bg-background rounded-lg border border-border"><span className="block text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Falhas</span>{finishImportSummary.failed}</div>
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-2">
                        {finishImportSummary.categories.map((category) => (
                          <div key={`${category.finishGroup}-${category.name}`} className="p-3 bg-background rounded-lg border border-border text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-foreground">{category.name}</span>
                              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{category.finishGroup}</span>
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {category.found} amostras | {category.created} criadas | {category.updated} atualizadas | {category.failed} falhas
                            </div>
                            {category.errors && category.errors.length > 0 && (
                              <div className="mt-1 text-[10px] text-destructive">{category.errors.slice(0, 2).join(', ')}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Add finish category */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] mb-2 block">Categorias de acabamento</label>
                  <div className="flex gap-2 mb-4">
                    <select
                      value={newFinishGroup}
                      onChange={e => setNewFinishGroup(e.target.value)}
                      className="px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground w-52"
                    >
                      <option value="Tecidos">Tecidos</option>
                      <option value="Superfícies e Pinturas">Superfícies e Pinturas</option>
                    </select>
                    <input
                      placeholder="Ex: Laminados de Madeira, Laqueados, Tecidos..."
                      value={newFinishCategoryName}
                      onChange={e => setNewFinishCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addFinishCategory()}
                      className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button onClick={addFinishCategory} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs"><Plus size={16} /></button>
                  </div>

                  {/* Group: Tecidos */}
                  {brandFinishCategories.filter(fc => fc.finish_group === 'Tecidos').length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-accent font-semibold mb-2">Tecidos</p>
                      <div className="space-y-2">
                        {brandFinishCategories.filter(fc => fc.finish_group === 'Tecidos').map(fc => (
                          <div key={fc.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                            <span className="text-sm text-foreground">{fc.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {finishItems.filter(fi => fi.finish_category_id === fc.id).length} itens
                              </span>
                              <button onClick={() => deleteFinishCategory(fc.id)} className="text-destructive"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Group: Superfícies e Pinturas */}
                  {brandFinishCategories.filter(fc => fc.finish_group === 'Superfícies e Pinturas').length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-accent font-semibold mb-2">Superfícies e Pinturas</p>
                      <div className="space-y-2">
                        {brandFinishCategories.filter(fc => fc.finish_group === 'Superfícies e Pinturas').map(fc => (
                          <div key={fc.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                            <span className="text-sm text-foreground">{fc.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {finishItems.filter(fi => fi.finish_category_id === fc.id).length} itens
                              </span>
                              <button onClick={() => deleteFinishCategory(fc.id)} className="text-destructive"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uncategorized (legacy without group) */}
                  {brandFinishCategories.filter(fc => !fc.finish_group).length > 0 && (
                    <div className="space-y-2">
                      {brandFinishCategories.filter(fc => !fc.finish_group).map(fc => (
                        <div key={fc.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                          <span className="text-sm text-foreground">{fc.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {finishItems.filter(fi => fi.finish_category_id === fc.id).length} itens
                            </span>
                            <button onClick={() => deleteFinishCategory(fc.id)} className="text-destructive"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {brandFinishCategories.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-4">Nenhuma categoria de acabamento cadastrada.</p>
                  )}
                </div>

                {/* Add finish items - batch upload */}
                {brandFinishCategories.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] mb-2 block">Adicionar acabamentos em lote</label>
                    <div className="space-y-3">
                      <select
                        className="w-full p-3 bg-secondary border border-border rounded-lg text-sm text-foreground"
                        value={selectedFinishCategory}
                        onChange={e => { setSelectedFinishCategory(e.target.value); setFinishUploadPreviews([]); }}
                      >
                        <option value="">Selecione a categoria</option>
                        {brandFinishCategories.map(fc => (
                          <option key={fc.id} value={fc.id}>{fc.name}</option>
                        ))}
                      </select>
                      {selectedFinishCategory && (
                        <>
                          <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-[0.1em]">Selecione várias imagens de uma vez</label>
                            <input type="file" accept="image/*" multiple onChange={handleFinishBatchUpload} className="w-full text-xs text-foreground" />
                          </div>
                          {finishUploadPreviews.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">{finishUploadPreviews.length} imagem(ns) selecionada(s) — nomeie cada acabamento</p>
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 mb-3">
                                {finishUploadPreviews.map((item, i) => (
                                  <div key={i} className="relative text-center">
                                    <div className="aspect-square rounded-lg overflow-hidden border border-border bg-secondary mb-1">
                                      <img src={item.preview} className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <input
                                      value={item.name}
                                      onChange={e => updateFinishPreviewName(i, e.target.value)}
                                      placeholder={`Acabamento ${i + 1}`}
                                      className="w-full text-[9px] text-foreground bg-secondary border border-border rounded px-1 py-0.5 text-center placeholder:text-muted-foreground"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setFinishUploadPreviews(prev => prev.filter((_, j) => j !== i))}
                                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button
                                onClick={handleSaveFinishBatch}
                                disabled={uploadingFinishes}
                                className="w-full bg-primary text-primary-foreground p-3 rounded-lg text-xs uppercase tracking-[0.15em] disabled:opacity-50"
                              >
                                {uploadingFinishes ? 'Salvando...' : `Salvar ${finishUploadPreviews.length} acabamento(s)`}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* List finish items by category */}
                {brandFinishCategories.map(fc => {
                  const items = finishItems.filter(fi => fi.finish_category_id === fc.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={fc.id}>
                      <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-foreground mb-3">{fc.name}</h4>
                      <div className="grid grid-cols-6 sm:grid-cols-8 gap-3">
                        {items.map(item => (
                          <div key={item.id} className="group relative text-center">
                            <div className="aspect-square rounded-lg overflow-hidden border border-border bg-secondary mb-1">
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <p className="text-[9px] text-muted-foreground leading-tight truncate">{item.name}</p>
                            <button
                              onClick={() => deleteFinishItem(item.id)}
                              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
