import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronLeft, Box, Layers, FileText, Heart, FolderPlus, LinkIcon, Check, X, Download, ChevronDown, GitCompareArrows } from 'lucide-react';
import logoCreatorMod from '@/assets/logo-creator-mod.svg';

const BELL_ARTE_LIVING_BRAND_ID = '6fa4bb1b-141f-4191-a6e1-33a56fc7837a';
import { useCompare } from '@/contexts/CompareContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { buildNewProjectPayload } from '@/lib/projectDefaults';
import { checkClientRateLimit, rateLimitMessage } from '@/lib/rateLimit';
import { firstZodMessage, projectNameSchema, sanitizePlainText } from '@/lib/validation';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import ProductCard from '@/components/ProductCard';
import ProductDimensions from '@/components/ProductDimensions';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

type Product = Tables<'products'> & {
  designer_id?: string | null;
  ambient_images?: string[] | null;
  height?: string | number | null;
  width?: string | number | null;
  depth?: string | number | null;
  is_hidden?: boolean | null;
};
type Brand = Tables<'brands'> & { is_hidden?: boolean | null };
type Project = Tables<'projects'>;
type FinishCategory = Tables<'finish_categories'>;
type Finish = Tables<'finishes'>;
type Designer = { id: string; name: string; bio: string | null; photo_url: string | null };
type ProductDownload = {
  id: string;
  product_id: string;
  download_type: 'tech_sheet' | '2d' | '3d';
  label: string;
  url: string;
  display_order: number;
};
type CompositionRule = {
  title: string;
  description: string;
  terms: string[];
  excludeTerms?: string[];
};

const PRODUCT_IMAGE_LIMIT = 5;
const COMPOSITION_SUGGESTION_LIMIT = 4;
const CREATOR_MOD_URL = 'https://creatormod.com.br/';
const PRODUCT_SELECT = 'id, name, brand_id, category, description, images, ambient_images, file_3d, file_2d, tech_sheet, finish_link, designer_id';
const PRODUCT_SELECT_LEGACY = 'id, name, brand_id, category, description, images, file_3d, file_2d, tech_sheet, finish_link, designer_id';
const PRODUCT_SELECT_WITH_VISIBILITY = `${PRODUCT_SELECT}, is_hidden`;
const PROJECT_PICKER_SELECT = 'id, name, user_id, seller_user_id, client_name, created_at';

async function fetchProductById(productId: string) {
  const result = await supabase
    .from('products')
    .select(PRODUCT_SELECT_WITH_VISIBILITY)
    .eq('id', productId)
    .eq('is_hidden', false)
    .maybeSingle();
  if (!result.error) return result;

  const message = `${result.error.message || ''} ${result.error.details || ''}`;
  if (!/ambient_images/i.test(message) && !isHiddenColumnMissing(result.error)) return result;

  return supabase.from('products').select(PRODUCT_SELECT_LEGACY).eq('id', productId).maybeSingle();
}

function cleanProductDescription(value: string | null | undefined) {
  return (value || '')
    .replace(/\bvisite\s+a\s+p[aá]gina(?:\s+e\s+conhe[cç]a)?!?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function buildProductDescription(product: Product, brand: Brand | null) {
  const cleaned = cleanProductDescription(product.description);
  if (cleaned) return cleaned;

  const brandText = brand?.name ? ` da ${brand.name}` : '';
  const categoryText = product.category ? ` na categoria ${product.category}` : '';
  return `${product.name}${brandText}${categoryText}. Produto selecionado para especificacao em projetos de arquitetura, com imagens, acabamentos e arquivos tecnicos reunidos na YLEON.`;
}

function normalizeCompositionText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compositionTextIncludes(value: string, term: string) {
  return normalizeCompositionText(value).includes(normalizeCompositionText(term));
}

function isBellArteBrand(brand: Brand | null) {
  const brandName = normalizeCompositionText(brand?.name);
  return Boolean(
    brand?.id === BELL_ARTE_LIVING_BRAND_ID
    || brandName.includes('bell arte')
    || brandName.includes('bellarte')
    || brandName.includes('bell art')
  );
}

function getCompositionRule(product: Product | null): CompositionRule | null {
  const category = normalizeCompositionText(product?.category);
  const name = normalizeCompositionText(product?.name);
  const haystack = `${category} ${name}`;

  if (haystack.includes('mesa') && haystack.includes('centro')) {
    return {
      title: 'Componha a sala de estar',
      description: 'Sugestoes para combinar com esta mesa de centro.',
      terms: ['Sof', 'Poltrona', 'Mesa Lateral'],
    };
  }

  if (haystack.includes('mesa') && haystack.includes('lateral')) {
    return {
      title: 'Componha a sala de estar',
      description: 'Sugestoes para combinar com esta mesa lateral.',
      terms: ['Sof', 'Poltrona', 'Mesa de Centro'],
    };
  }

  if (haystack.includes('cama')) {
    return {
      title: 'Complete o quarto',
      description: 'Sugestoes para compor com esta cama.',
      terms: ['Mesa de Cabeceira', 'Cabeceira', 'Criado', 'moda'],
    };
  }

  if (haystack.includes('sofa')) {
    return {
      title: 'Componha a sala de estar',
      description: 'Sugestoes para combinar com este sofa.',
      terms: ['Mesa de Centro', 'Mesa Lateral', 'Poltrona', 'Pufe'],
    };
  }

  if (haystack.includes('poltrona')) {
    return {
      title: 'Componha a sala de estar',
      description: 'Sugestoes para combinar com esta poltrona.',
      terms: ['Sof', 'Mesa Lateral', 'Mesa de Centro', 'Pufe'],
    };
  }

  if (haystack.includes('banqueta')) {
    return {
      title: 'Composicao para banquetas',
      description: 'Sugestoes para combinar com esta banqueta.',
      terms: ['Mesa', 'Bancada', 'Bistr', 'Mesa Alta'],
      excludeTerms: ['Mesa de Centro', 'Mesa Lateral', 'Mesa de Cabeceira'],
    };
  }

  if (haystack.includes('cadeira')) {
    return {
      title: 'Mesas compativeis',
      description: 'Sugestoes para combinar com esta cadeira.',
      terms: ['Mesa de Jantar', 'Mesa'],
      excludeTerms: ['Mesa de Centro', 'Mesa Lateral', 'Mesa de Cabeceira'],
    };
  }

  if (
    haystack.includes('mesa') &&
    !haystack.includes('cabeceira') &&
    !haystack.includes('centro') &&
    !haystack.includes('lateral')
  ) {
    return {
      title: 'Cadeiras compatíveis',
      description: 'Sugestões para compor com esta mesa.',
      terms: ['Cadeira'],
    };
  }

  return null;
}

const COMPOSITION_NAME_STOP_WORDS = new Set([
  'a', 'as', 'de', 'da', 'das', 'do', 'dos', 'e', 'o', 'os', 'para', 'com',
  'mesa', 'cadeira', 'cadeiras', 'banqueta', 'banquetas', 'cama', 'sofa',
  'poltrona', 'poltronas', 'centro', 'lateral', 'laterais', 'jantar',
  'cabeceira', 'criado', 'comoda', 'pufe', 'alta', 'bistro', 'bancada',
]);

function getCompositionNameTokens(value: string | null | undefined) {
  return normalizeCompositionText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !COMPOSITION_NAME_STOP_WORDS.has(token));
}

function hasNameAffinity(source: Product, candidate: Product) {
  const sourceTokens = new Set(getCompositionNameTokens(source.name));
  if (sourceTokens.size === 0) return false;
  return getCompositionNameTokens(candidate.name).some(token => sourceTokens.has(token));
}

function hasStyleAffinity(productId: string, currentStyleIds: Set<string>, styleMap: Map<string, Set<string>>) {
  if (currentStyleIds.size === 0) return false;
  const candidateStyleIds = styleMap.get(productId);
  if (!candidateStyleIds) return false;
  return [...candidateStyleIds].some(styleId => currentStyleIds.has(styleId));
}

function shuffleCompositionProducts(items: Product[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function selectCompositionProducts(
  source: Product,
  candidates: Product[],
  currentStyleIds: Set<string>,
  candidateStyleMap: Map<string, Set<string>>,
) {
  const score = (candidate: Product) => {
    let total = 0;
    if (candidate.brand_id === source.brand_id) total += 100;
    if (hasStyleAffinity(candidate.id, currentStyleIds, candidateStyleMap)) total += 40;
    if (hasNameAffinity(source, candidate)) total += 25;
    return total;
  };

  const ordered = shuffleCompositionProducts(candidates).sort((a, b) => {
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    return Math.random() - 0.5;
  });

  const selected: Product[] = [];
  const selectedIds = new Set<string>();
  const selectedBrandIds = new Set<string>();

  const sameBrand = ordered.find(item => item.brand_id === source.brand_id);
  if (sameBrand) {
    selected.push(sameBrand);
    selectedIds.add(sameBrand.id);
    selectedBrandIds.add(sameBrand.brand_id);
  }

  for (const candidate of ordered) {
    if (selected.length >= COMPOSITION_SUGGESTION_LIMIT) break;
    if (selectedIds.has(candidate.id)) continue;
    if (candidate.brand_id === source.brand_id) continue;
    if (selectedBrandIds.has(candidate.brand_id)) continue;

    selected.push(candidate);
    selectedIds.add(candidate.id);
    selectedBrandIds.add(candidate.brand_id);
  }

  for (const candidate of ordered) {
    if (selected.length >= COMPOSITION_SUGGESTION_LIMIT) break;
    if (selectedIds.has(candidate.id)) continue;

    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  return selected;
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const location = useLocation();
  const { user, isStaff } = useAuth();
  const { addItem: addToCompare, removeItem: removeFromCompare, isInCompare } = useCompare();

  // Get product from route state for instant render
  const routeProduct = (location.state as any)?.product as Product | undefined;

  const [product, setProduct] = useState<Product | null>(routeProduct ?? null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [showDesignerInfo, setShowDesignerInfo] = useState(false);
  const [mainPhotoIndex, setMainPhotoIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [loading, setLoading] = useState(!routeProduct);
  const [copied, setCopied] = useState(false);
  const [finishCategories, setFinishCategories] = useState<FinishCategory[]>([]);
  const [finishes, setFinishes] = useState<Finish[]>([]);
  const [loadingFinishes, setLoadingFinishes] = useState(true);
  const [productFinishCatIds, setProductFinishCatIds] = useState<string[] | null>(null);
  const [productDownloads, setProductDownloads] = useState<ProductDownload[]>([]);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [openFinishCats, setOpenFinishCats] = useState<Set<string>>(new Set());
  const [compositionProducts, setCompositionProducts] = useState<Product[]>([]);
  const [compositionBrandMap, setCompositionBrandMap] = useState<Map<string, string>>(new Map());
  const [loadingComposition, setLoadingComposition] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Finish selection for project (up to 2)
  const [showFinishPicker, setShowFinishPicker] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedFinishId, setSelectedFinishId] = useState<string | null>(null);
  const [selectedFinishId2, setSelectedFinishId2] = useState<string | null>(null);
  const [projectNote, setProjectNote] = useState('');

  // Phase 1: Product + brand (critical path)
  useEffect(() => {
    let cancelled = false;

    const fetchProduct = async () => {
      let prod = routeProduct ?? null;
      if (!prod) {
        const { data } = await fetchProductById(productId!);
        if (cancelled) return;
        prod = data as Product | null;
        setProduct(prod);
      }

      if (!prod) { if (!cancelled) setLoading(false); return; }
      if (!isCatalogRecordVisible(prod, getLocalHiddenProductIds())) {
        if (!cancelled) {
          setProduct(null);
          setLoading(false);
        }
        return;
      }

      // Fetch brand + user data (fast, small queries)
      const promises: Array<Promise<any>> = [
        (async () => {
          let result = await supabase
            .from('brands')
            .select('id, name, logo_url, segment, is_hidden')
            .eq('id', prod.brand_id)
            .eq('is_hidden', false)
            .maybeSingle();
          if (result.error && isHiddenColumnMissing(result.error)) {
            result = await supabase.from('brands').select('id, name, logo_url, segment').eq('id', prod.brand_id).maybeSingle();
          }
          if (cancelled) return;
          const visibleBrand = mergeLocalHiddenState(result.data ? [result.data as Brand] : [], getLocalHiddenBrandIds())
            .filter(item => isCatalogRecordVisible(item, getLocalHiddenBrandIds()))[0] ?? null;
          setBrand(visibleBrand);
          if (!visibleBrand) setProduct(null);
        })() as Promise<any>,
      ];
      if (prod.designer_id) {
        promises.push(
          (supabase.from('designers' as any) as any).select('id, name, bio, photo_url').eq('id', prod.designer_id).single().then((r: any) => {
            if (!cancelled && r.data) setDesigner(r.data as Designer);
          }) as Promise<any>,
        );
      }
      if (user) {
        promises.push(
          supabase.from('favorites').select('id').eq('user_id', user.id).eq('product_id', productId!).then(r => { if (!cancelled) setIsFavorited((r.data?.length ?? 0) > 0); }) as unknown as Promise<any>,
          (isStaff
            ? supabase.from('projects').select(PROJECT_PICKER_SELECT)
            : supabase.from('projects').select(PROJECT_PICKER_SELECT).eq('user_id', user.id)
          ).then(r => { if (!cancelled) setProjects((r.data as Project[]) ?? []); }) as unknown as Promise<any>,
        );
      }

      // Fetch full product if route state was partial
      if (routeProduct && (!routeProduct.description && !routeProduct.file_3d)) {
        promises.push(
          fetchProductById(productId!).then(r => {
            if (!cancelled && r.data) {
              const fullProd = r.data as Product;
              setProduct(fullProd);
              if (fullProd.designer_id && !designer) {
                (supabase.from('designers' as any) as any).select('id, name, bio, photo_url').eq('id', fullProd.designer_id).single().then((rr: any) => {
                  if (!cancelled && rr.data) setDesigner(rr.data as Designer);
                });
              }
            }
          }) as unknown as Promise<any>,
        );
      }

      await Promise.all(promises);
      if (!cancelled) setLoading(false);
    };

    fetchProduct();
    return () => { cancelled = true; };
  }, [productId, user, isStaff]);

  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;

    const fetchDownloads = async () => {
      const { data } = await (supabase.from('product_downloads' as any) as any)
        .select('id, product_id, download_type, label, url, display_order')
        .eq('product_id', product.id)
        .order('display_order');

      if (!cancelled) setProductDownloads((data as ProductDownload[]) ?? []);
    };

    fetchDownloads();
    return () => { cancelled = true; };
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const rule = getCompositionRule(product);
    if (!rule) {
      setCompositionProducts([]);
      setCompositionBrandMap(new Map());
      setLoadingComposition(false);
      return;
    }

    let cancelled = false;
    const fetchComposition = async () => {
      setLoadingComposition(true);
      try {
        const manualLinksResult = await ((supabase.from('product_composition_suggestions' as any) as any)
          .select('suggested_product_id, display_order')
          .eq('product_id', product.id)
          .order('display_order'));

        if (!cancelled && !manualLinksResult.error && manualLinksResult.data?.length > 0) {
          const manualIds = [...new Set((manualLinksResult.data as Array<{ suggested_product_id: string }>)
            .map(item => item.suggested_product_id)
            .filter(Boolean))]
            .slice(0, COMPOSITION_SUGGESTION_LIMIT);

          const { data: manualProductsData } = await supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .in('id', manualIds);

          if (cancelled) return;

          const manualProductMap = new Map(((manualProductsData ?? []) as Product[]).map(item => [item.id, item]));
          const manualProducts = manualIds
            .map(id => manualProductMap.get(id))
            .filter((item): item is Product => Boolean(item));

          setCompositionProducts(manualProducts);

          const manualBrandIds = [...new Set(manualProducts.map(item => item.brand_id).filter(Boolean))];
          if (manualBrandIds.length === 0) {
            setCompositionBrandMap(new Map());
            return;
          }

          const { data: manualBrandsData } = await supabase
            .from('brands')
            .select('id, name')
            .in('id', manualBrandIds);

          if (!cancelled) {
            setCompositionBrandMap(new Map((manualBrandsData ?? []).map(item => [item.id, item.name])));
          }
          return;
        }

        const results = await Promise.all(rule.terms.map(async (term) => {
          const [sameBrandRes, otherBrandsRes] = await Promise.all([
            supabase
              .from('products')
              .select('id, name, brand_id, category, images')
              .or(`category.ilike.%${term}%,name.ilike.%${term}%`)
              .eq('brand_id', product.brand_id)
              .neq('id', product.id)
              .limit(12),
            supabase
              .from('products')
              .select('id, name, brand_id, category, images')
              .or(`category.ilike.%${term}%,name.ilike.%${term}%`)
              .neq('brand_id', product.brand_id)
              .neq('id', product.id)
              .limit(120),
          ]);
          return ([...(sameBrandRes.data ?? []), ...(otherBrandsRes.data ?? [])] as Product[]);
        }));

        if (cancelled) return;

        const byId = new Map<string, Product>();
        results.flat().forEach(item => {
          const candidateText = `${item.category || ''} ${item.name || ''}`;
          const matchesTarget = rule.terms.some(term => compositionTextIncludes(candidateText, term));
          const matchesExcluded = (rule.excludeTerms ?? []).some(term => compositionTextIncludes(candidateText, term));
          if (item.id !== product.id && matchesTarget && !matchesExcluded) byId.set(item.id, item);
        });

        const candidates = [...byId.values()];
        const candidateIds = candidates.map(item => item.id);
        let currentStyleIds = new Set<string>();
        let candidateStyleMap = new Map<string, Set<string>>();

        if (candidateIds.length > 0) {
          const [currentStylesRes, candidateStylesRes] = await Promise.all([
            supabase
              .from('product_style_tags')
              .select('style_tag_id')
              .eq('product_id', product.id),
            supabase
              .from('product_style_tags')
              .select('product_id, style_tag_id')
              .in('product_id', candidateIds),
          ]);

          if (cancelled) return;

          currentStyleIds = new Set(((currentStylesRes.data ?? []) as Array<{ style_tag_id: string }>)
            .map(item => item.style_tag_id));

          candidateStyleMap = ((candidateStylesRes.data ?? []) as Array<{ product_id: string; style_tag_id: string }>)
            .reduce((map, item) => {
              const current = map.get(item.product_id) ?? new Set<string>();
              current.add(item.style_tag_id);
              map.set(item.product_id, current);
              return map;
            }, new Map<string, Set<string>>());
        }

        const ordered = selectCompositionProducts(product, candidates, currentStyleIds, candidateStyleMap);

        setCompositionProducts(ordered);

        const brandIds = [...new Set(ordered.map(item => item.brand_id).filter(Boolean))];
        if (brandIds.length === 0) {
          setCompositionBrandMap(new Map());
          return;
        }

        const { data: brandsData } = await supabase
          .from('brands')
          .select('id, name')
          .in('id', brandIds);

        if (!cancelled) {
          setCompositionBrandMap(new Map((brandsData ?? []).map(item => [item.id, item.name])));
        }
      } finally {
        if (!cancelled) setLoadingComposition(false);
      }
    };

    void fetchComposition();
    return () => { cancelled = true; };
  }, [product?.id, product?.category, product?.name, product?.brand_id]);

  // Phase 2: Finishes (non-blocking, loads after product renders)
  useEffect(() => {
    if (!product) return;
    let cancelled = false;

    const fetchFinishes = async () => {
      setLoadingFinishes(true);
      try {
        // Get finish categories for this brand + product finish config in parallel
        const [fcRes, pfcRes] = await Promise.all([
          supabase.from('finish_categories').select('id, name, brand_id, display_order, finish_group').eq('brand_id', product.brand_id).order('display_order'),
          supabase.from('product_finish_categories').select('finish_category_id').eq('product_id', product.id),
        ]);
        if (cancelled) return;

        const cats = (fcRes.data as FinishCategory[]) ?? [];
        setFinishCategories(cats);

        const pfcIds = (pfcRes.data ?? []).map((d: any) => d.finish_category_id);
        setProductFinishCatIds(pfcIds.length > 0 ? pfcIds : null);

        // Now fetch only finishes for these categories (not all finishes in the DB)
        const catIds = cats.map(c => c.id);
        if (catIds.length > 0) {
          const { data: finishesData } = await supabase
            .from('finishes')
            .select('id, name, image_url, finish_category_id, display_order')
            .in('finish_category_id', catIds)
            .order('display_order');
          if (!cancelled) setFinishes((finishesData as Finish[]) ?? []);
        }
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoadingFinishes(false);
      }
    };

    fetchFinishes();
    return () => { cancelled = true; };
  }, [product?.id, product?.brand_id]);

  const filteredFinishCategories = useMemo(() => {
    if (productFinishCatIds) return finishCategories.filter(c => productFinishCatIds.includes(c.id));
    return finishCategories;
  }, [finishCategories, productFinishCatIds]);
  const brandFinishCategoryIds = useMemo(() => new Set(filteredFinishCategories.map(c => c.id)), [filteredFinishCategories]);
  const brandFinishes = useMemo(() => finishes.filter(f => brandFinishCategoryIds.has(f.finish_category_id)), [finishes, brandFinishCategoryIds]);

  useEffect(() => {
    if (!showProjectMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProjectMenu]);

  useEffect(() => {
    if (!lightboxImage) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxImage]);

  const toggleFavorite = useCallback(async () => {
    if (!user || !product) return;
    if (isFavorited) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('product_id', product.id);
      setIsFavorited(false);
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, product_id: product.id });
      setIsFavorited(true);
      try {
        localStorage.setItem(`onboarding_last_favorite_${user.id}`, product.id);
        window.dispatchEvent(new CustomEvent('architect-onboarding:favorited', { detail: { productId: product.id } }));
      } catch { /* noop */ }
    }
  }, [user, product, isFavorited]);

  const initiateAddToProject = useCallback((projId: string) => {
    setSelectedProjectId(projId);
    setSelectedFinishId(null);
    setSelectedFinishId2(null);
    setProjectNote('');
    if (brandFinishes.length > 0) {
      setShowProjectMenu(false);
      setShowFinishPicker(true);
    } else {
      addToProjectDirectly(projId, null, null, '');
    }
  }, [brandFinishes]);

  const addToProjectDirectly = useCallback(async (projId: string, finishId: string | null, finishId2: string | null, notes: string) => {
    if (!product) return;
    const rate = checkClientRateLimit('project:update', projId);
    if (!rate.allowed) {
      toast({ title: 'Muitas alteracoes', description: rateLimitMessage(rate), variant: 'destructive' });
      return;
    }
    const insertData: any = { project_id: projId, product_id: product.id };
    if (finishId) insertData.selected_finish_id = finishId;
    if (finishId2) insertData.selected_finish_id_2 = finishId2;
    if (notes.trim()) insertData.notes = sanitizePlainText(notes, 1000);
    await supabase.from('project_items').insert(insertData);
    try {
      window.dispatchEvent(new CustomEvent('architect-onboarding:item-added-to-project', {
        detail: { projectId: projId, productId: product.id },
      }));
    } catch { /* noop */ }
    setShowProjectMenu(false);
    setShowFinishPicker(false);
    toast({ title: 'Produto adicionado!', description: 'O produto foi adicionado ao projeto.' });
  }, [product]);

  const confirmAddWithFinish = useCallback(async () => {
    if (!selectedProjectId) return;
    await addToProjectDirectly(selectedProjectId, selectedFinishId, selectedFinishId2, projectNote);
  }, [selectedProjectId, selectedFinishId, selectedFinishId2, projectNote, addToProjectDirectly]);

  const createProjectAndAdd = useCallback(async () => {
    if (!user || !product || !newProjectName.trim()) return;
    if (!newClientName.trim()) {
      toast({ title: 'Informe o cliente', description: 'O projeto precisa ter o nome do cliente final.', variant: 'destructive' });
      return;
    }
    const parsed = projectNameSchema.safeParse(newProjectName);
    if (!parsed.success) {
      toast({ title: 'Confira o nome do projeto', description: firstZodMessage(parsed.error), variant: 'destructive' });
      return;
    }
    const rate = checkClientRateLimit('project:create', user.id);
    if (!rate.allowed) {
      toast({ title: 'Muitas tentativas', description: rateLimitMessage(rate), variant: 'destructive' });
      return;
    }
    const projectName = parsed.data;
    const { data, error } = await (supabase as any)
      .from('projects')
      .insert(buildNewProjectPayload(user.id, projectName, { clientName: newClientName.trim() }))
      .select(PROJECT_PICKER_SELECT)
      .single();
    if (error) {
      toast({ title: 'Erro ao criar projeto', description: 'Confira os dados e suas permissoes.', variant: 'destructive' });
      return;
    }
    if (data) {
      setProjects(prev => [...prev, data]);
      try {
        window.dispatchEvent(new CustomEvent('architect-onboarding:project-created', { detail: { projectId: data.id } }));
      } catch { /* noop */ }
      initiateAddToProject(data.id);
    }
    setNewProjectName('');
    setNewClientName('');
  }, [user, product, newProjectName, newClientName, initiateAddToProject]);

  const toggleFinishSelection = useCallback((finishId: string) => {
    if (selectedFinishId === finishId) {
      setSelectedFinishId(null);
    } else if (selectedFinishId2 === finishId) {
      setSelectedFinishId2(null);
    } else if (!selectedFinishId) {
      setSelectedFinishId(finishId);
    } else if (!selectedFinishId2) {
      setSelectedFinishId2(finishId);
    } else {
      // Replace the second one
      setSelectedFinishId2(finishId);
    }
  }, [selectedFinishId, selectedFinishId2]);

  const copyLink = useCallback(() => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, []);

  if (loading || !product) {
    return (
      <div className="min-h-screen bg-background" role="status" aria-label="Carregando produto">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
          <div className="h-4 w-16 bg-muted animate-pulse rounded mb-12" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 space-y-4">
              <div className="aspect-[4/5] bg-muted animate-pulse rounded-sm" />
              <div className="grid grid-cols-4 gap-3">
                {[...Array(3)].map((_, i) => <div key={i} className="aspect-square bg-muted animate-pulse rounded-sm" />)}
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="h-3 w-20 bg-muted animate-pulse rounded mb-3" />
              <div className="h-10 w-48 bg-muted animate-pulse rounded mb-6" />
              <div className="h-20 w-full bg-muted animate-pulse rounded mb-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const storedImages = product.images ?? [];
  const productImages = storedImages.slice(0, PRODUCT_IMAGE_LIMIT);
  const ambientImages = ((product.ambient_images && product.ambient_images.length > 0)
    ? product.ambient_images
    : storedImages.slice(PRODUCT_IMAGE_LIMIT)).filter(Boolean).slice(0, 3);
  const images = productImages.length ? productImages : ['/placeholder.svg'];
  const productDescription = buildProductDescription(product, brand);
  const compositionRule = getCompositionRule(product);

  const isDownloadableFile = (url: string) => /\.(skp|7z|zip|rar|max|dwg|dxf)($|\?)/i.test(url);
  const isManualUrl = (url: string | null | undefined) =>
    /manual|manuais|instru[cç][oõ]es|instrucoes/i.test(url || '');

  // Reescreve URLs do Supabase Storage para passar por nosso proxy.
  // Isso evita ERR_BLOCKED_BY_CLIENT de bloqueadores como uBlock/AdBlock.
  const SUPABASE_HOST = (() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
    } catch {
      return '';
    }
  })();
  const proxify = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname === SUPABASE_HOST) {
        return `https://${SUPABASE_HOST}/functions/v1/proxy-file?url=${encodeURIComponent(url)}`;
      }
    } catch { /* ignore */ }
    return url;
  };

  const techSheetHref = isManualUrl(product.tech_sheet) ? null : proxify(product.tech_sheet);

  const handleTechSheetClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.href || techSheetHref;
    if (!href) return;
    // Detecta bloqueio: tenta um HEAD/fetch rápido. Se falhar, mostra aviso.
    // Não bloqueamos a abertura — deixamos o link abrir e validamos em paralelo.
    fetch(href, { method: 'HEAD', mode: 'no-cors' }).catch(() => {
      toast({
        title: 'Arquivo bloqueado pelo navegador',
        description: 'Seu bloqueador de anúncios (AdBlock, uBlock, Brave Shields) está bloqueando o PDF. Desative-o para este site ou use uma janela anônima sem extensões.',
        variant: 'destructive',
      });
    });
  };

  const normalizedProductDownloads = productDownloads.filter((item) => !isManualUrl(`${item.label} ${item.url}`));
  const tableDownloadLinks = normalizedProductDownloads.map((item) => {
      const icon = item.download_type === '3d' ? Box : item.download_type === '2d' ? Layers : FileText;
      const prefix = item.download_type === '3d' ? 'Bloco 3D' : item.download_type === '2d' ? 'Bloco 2D' : 'Ficha Técnica';
      const isFinishesDownload = item.label?.toLowerCase().includes('acabamento');
      const label = isFinishesDownload
        ? 'Acabamentos'
        : item.download_type === 'tech_sheet'
        ? prefix
        : item.label && !item.label.toLowerCase().includes(prefix.toLowerCase())
        ? `${prefix} - ${item.label}`
        : prefix;
      return {
        type: item.download_type,
        label,
        href: proxify(item.url),
        icon,
        download: isDownloadableFile(item.url || ''),
        onClick: item.download_type === 'tech_sheet' && !isFinishesDownload ? handleTechSheetClick : undefined as ((e: React.MouseEvent<HTMLAnchorElement>) => void) | undefined,
      };
    });
  const legacyDownloadLinks = [
    { type: '3d' as const, label: 'Bloco 3D', href: product.file_3d, icon: Box, download: isDownloadableFile(product.file_3d || ''), onClick: undefined as ((e: React.MouseEvent<HTMLAnchorElement>) => void) | undefined },
    { type: '2d' as const, label: 'Bloco 2D', href: product.file_2d, icon: Layers, download: isDownloadableFile(product.file_2d || ''), onClick: undefined },
    { type: 'tech_sheet' as const, label: 'Ficha Técnica', href: techSheetHref, icon: FileText, download: false, onClick: handleTechSheetClick },
  ];
  const productFieldTypes = new Set(legacyDownloadLinks.filter((item) => item.href).map((item) => item.type));
  const preferredTableDownloadLinks = tableDownloadLinks.filter((item) => {
    if (item.label === 'Acabamentos') return true;
    if (item.type === '2d' || item.type === 'tech_sheet') return !productFieldTypes.has(item.type);
    return true;
  });
  const downloadLinks = [
    ...legacyDownloadLinks.filter((item) => item.href || !preferredTableDownloadLinks.some((table) => table.type === item.type)),
    ...preferredTableDownloadLinks.filter((item) => !legacyDownloadLinks.some((legacy) => legacy.href === item.href)),
  ];


  return (
    <div className="min-h-screen bg-background">
      {product && (
        <Helmet>
          <title>{`${product.name}${brand ? ` - ${brand.name}` : ''} | YLEON`}</title>
          <meta name="description" content={productDescription.slice(0, 155)} />
          <link rel="canonical" href={`https://yleon.com.br/product/${product.id}`} />
          <meta property="og:type" content="product" />
          <meta property="og:title" content={`${product.name}${brand ? ` - ${brand.name}` : ''}`} />
          <meta property="og:description" content={productDescription.slice(0, 200)} />
          <meta property="og:url" content={`https://yleon.com.br/product/${product.id}`} />
          {product.images?.[0] && <meta property="og:image" content={product.images[0]} />}
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: productDescription,
            image: product.images?.[0] || undefined,
            category: product.category || undefined,
            brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
          })}</script>
        </Helmet>
      )}
      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-foreground/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-label={`Imagem: ${lightboxImage.name}`}
        >
          <div className="relative max-w-lg w-full animate-scale-in" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-background hover:text-accent transition-colors"
              aria-label="Fechar"
            >
              <X size={24} />
            </button>
            <img src={lightboxImage.url} alt={lightboxImage.name} className="w-full rounded-sm shadow-2xl" />
            <p className="text-center text-background text-sm mt-3 font-light tracking-wide">{lightboxImage.name}</p>
          </div>
        </div>
      )}


      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 md:py-12">
        {/* Breadcrumb */}
        <Link
          to={brand ? `/brand/${brand.id}` : '/catalog'}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-10 hover:text-foreground transition-colors"
          aria-label="Voltar ao catálogo"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          {brand?.name || 'Catálogo'}
        </Link>

        {isBellArteBrand(brand) && (
          <div className="-mt-8 mb-10 flex justify-end">
            <a
              href={CREATOR_MOD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 max-w-[150px] items-center rounded-full border border-border bg-card/80 px-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-card hover:shadow-md"
              aria-label="Visitar Creator Mod"
            >
              <img src={logoCreatorMod} alt="Creator Mod" className="h-4 w-auto max-w-full opacity-80" />
            </a>
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14">
          {/* Gallery column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="aspect-[4/5] bg-muted/30 overflow-hidden rounded-sm flex items-center justify-center border border-border shadow-sm">
              <img
                src={images[mainPhotoIndex]}
                loading="eager"
                decoding="async"
                width={700}
                height={875}
                className="max-w-full max-h-full object-contain transition-opacity duration-500"
                alt={`${product.name} — foto principal`}
              />
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-3" role="tablist" aria-label="Galeria de fotos">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setMainPhotoIndex(i)}
                    role="tab"
                    aria-selected={mainPhotoIndex === i}
                    className={`aspect-square bg-card overflow-hidden rounded-sm border flex items-center justify-center p-1 transition-all ${
                      mainPhotoIndex === i
                        ? 'border-accent ring-1 ring-accent/30 opacity-100'
                        : 'border-border opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img src={img} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" alt={`${product.name} — miniatura ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details column */}
          <div className="lg:col-span-5 flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-medium mb-2">{brand?.name}</span>

            <div className="flex items-start justify-between gap-4 mb-6">
              <h1 className="text-3xl md:text-4xl font-serif text-foreground leading-tight">{product.name}</h1>
              <div className="flex gap-2 shrink-0 mt-1">
                {product && (() => {
                  const inCompare = isInCompare(product.id);
                  return (
                    <button
                      onClick={() => inCompare ? removeFromCompare(product.id) : addToCompare(product, brand?.name || '')}
                      aria-label={inCompare ? 'Remover da comparação' : 'Comparar'}
                      className={`p-2.5 rounded-full border transition-all duration-200 ${
                        inCompare
                          ? 'bg-accent/10 border-accent/30 text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      }`}
                    >
                      <GitCompareArrows size={18} />
                    </button>
                  );
                })()}
                <button
                  onClick={toggleFavorite}
                  aria-label={isFavorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  className={`p-2.5 rounded-full border transition-all duration-200 ${
                    isFavorited
                      ? 'bg-destructive/10 border-destructive/30 text-destructive'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  }`}
                >
                  <Heart size={18} fill={isFavorited ? 'currentColor' : 'none'} />
                </button>
                <div className="relative" ref={projectMenuRef}>
                  <button
                    onClick={() => setShowProjectMenu(prev => !prev)}
                    data-onboarding="add-to-project"
                    className="p-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all duration-200"
                    aria-label="Adicionar ao projeto"
                  >
                    <FolderPlus size={18} />
                  </button>
                  {showProjectMenu && (
                    <div className="absolute right-0 top-12 w-64 bg-card border border-border rounded-lg shadow-lg p-4 z-50 animate-fade-in" role="menu">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">Adicionar ao Projeto</p>
                      {projects.map(proj => (
                        <button
                          key={proj.id}
                          onClick={() => initiateAddToProject(proj.id)}
                          role="menuitem"
                          className="block w-full text-left text-sm py-2 px-3 rounded-md hover:bg-secondary transition-colors text-foreground"
                        >
                          {proj.name}
                        </button>
                      ))}
                      <div className="mt-3 pt-3 border-t border-border">
                        <input
                          data-onboarding="new-project-name"
                          placeholder="Novo projeto..."
                          value={newProjectName}
                          onChange={e => setNewProjectName(e.target.value)}
                          className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground"
                        />
                        <input
                          placeholder="Cliente final..."
                          value={newClientName}
                          onChange={e => setNewClientName(e.target.value)}
                          className="mt-2 w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground"
                          onKeyDown={e => e.key === 'Enter' && createProjectAndAdd()}
                        />
                        <button
                          onClick={createProjectAndAdd}
                          data-onboarding="create-and-add-project"
                          disabled={!newProjectName.trim() || !newClientName.trim()}
                          className="w-full mt-2 py-2 bg-primary text-primary-foreground rounded-md text-xs uppercase tracking-[0.1em] disabled:opacity-50"
                        >
                          Criar e Adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <span className="inline-block self-start text-[10px] uppercase tracking-[0.15em] text-muted-foreground border border-border rounded-full px-3 py-1 mb-6">
              {product.category}
            </span>

            {/* Designer signature (assina a peça) */}
            {designer && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => designer.bio && setShowDesignerInfo(true)}
                  className="group inline-flex items-center gap-3 -ml-1 px-2 py-1.5 rounded-full hover:bg-secondary/60 transition-colors"
                  aria-label={designer.bio ? `Ver biografia de ${designer.name}` : designer.name}
                >
                  {designer.photo_url ? (
                    <img
                      src={designer.photo_url}
                      alt={designer.name}
                      className="w-9 h-9 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-secondary border border-border" />
                  )}
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Design por</span>
                    <span className="text-sm font-serif text-foreground group-hover:text-accent transition-colors">{designer.name}</span>
                  </span>
                </button>
              </div>
            )}

            {productDescription && (
              <p className="text-muted-foreground leading-relaxed font-light text-sm whitespace-pre-wrap mb-8">
                {productDescription}
              </p>
            )}

            <ProductDimensions
              height={product.height}
              width={product.width}
              depth={product.depth}
              description={product.description}
            />

            <div className="h-px bg-border mb-8" />

            {/* Architect Tools */}
            <div className="space-y-4 mb-8">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground font-semibold">
                Ferramentas do Arquiteto
              </h2>
              <div className="grid grid-cols-1 gap-2">
                {downloadLinks.map(({ label, href, icon: Icon, download, onClick }) => {
                  if (!href) {
                    return (
                      <div key={`${label}-empty`} className="flex items-center gap-3 px-4 py-3 rounded-sm border opacity-30 cursor-not-allowed pointer-events-none border-border bg-card">
                        <Icon size={16} className="text-accent shrink-0" />
                        <span className="text-xs font-medium text-foreground tracking-wide">{label}</span>
                      </div>
                    );
                  }

                  return (
                    <a
                      key={`${label}-${href}`}
                      href={href}
                      onClick={onClick}
                      {...(download ? { download: true } : { target: '_blank', rel: 'noopener noreferrer' })}
                      className="flex items-center gap-3 px-4 py-3 rounded-sm border transition-all duration-200 border-border bg-card hover:bg-secondary hover:border-foreground/20 cursor-pointer"
                    >
                      <Icon size={16} className="text-accent shrink-0" />
                      <span className="text-xs font-medium text-foreground tracking-wide">{label}</span>
                      {download && <Download size={14} className="ml-auto text-muted-foreground" />}
                    </a>
                  );
                })}
              </div>
            </div>

            <button
              onClick={copyLink}
              className="w-full bg-primary text-primary-foreground py-3.5 rounded-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity text-xs uppercase tracking-[0.15em] font-medium"
            >
              {copied ? <Check size={16} /> : <LinkIcon size={16} />}
              {copied ? 'Link Copiado!' : 'Copiar Link'}
            </button>
          </div>
        </div>

        {ambientImages.length > 0 && (
          <section className="mt-16 md:mt-24 pt-12 border-t border-border">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-medium">{brand?.name}</span>
                <h2 className="text-2xl md:text-3xl font-serif text-foreground mt-1">Produto em Ambientes</h2>
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {ambientImages.length} foto{ambientImages.length > 1 ? 's' : ''}
              </span>
            </div>

            <Carousel
              opts={{ align: 'start', loop: ambientImages.length > 1 }}
              className="w-full"
              aria-label="Fotos ambientadas do produto"
            >
              <CarouselContent className="-ml-3 md:-ml-4">
                {ambientImages.map((image, index) => (
                  <CarouselItem key={`${image}-${index}`} className="pl-3 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                    <button
                      type="button"
                      onClick={() => setLightboxImage({ url: image, name: `${product.name} em ambiente ${index + 1}` })}
                      className="group block w-full text-left"
                    >
                      <div className="aspect-[4/3] overflow-hidden rounded-sm border border-border bg-muted/30">
                        <img
                          src={image}
                          alt={`${product.name} em ambiente ${index + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      </div>
                    </button>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {ambientImages.length > 1 && (
                <>
                  <CarouselPrevious className="left-3 md:-left-4 bg-background/90" />
                  <CarouselNext className="right-3 md:-right-4 bg-background/90" />
                </>
              )}
            </Carousel>
          </section>
        )}

        {/* Acabamentos Section */}
        {loadingFinishes ? (
          <section className="mt-16 md:mt-24 pt-12 border-t border-border">
            <div className="mb-10">
              <div className="h-3 w-20 bg-muted animate-pulse rounded mb-2" />
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </section>
        ) : filteredFinishCategories.length > 0 && brandFinishes.length > 0 && (
          <section className="mt-16 md:mt-24 pt-12 border-t border-border">
            <div className="mb-10">
              <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-medium">{brand?.name}</span>
              <h2 className="text-2xl md:text-3xl font-serif text-foreground mt-1">Acabamentos</h2>
            </div>

            {/* Two top-level groups */}
            {(['Tecidos', 'Superfícies e Pinturas'] as const).map(groupName => {
              const groupCats = filteredFinishCategories.filter((c: any) => (c as any).finish_group === groupName);
              if (groupCats.length === 0) return null;
              const groupFinishes = brandFinishes.filter(f => groupCats.some(c => c.id === f.finish_category_id));
              if (groupFinishes.length === 0) return null;
              const isGroupOpen = openFinishCats.has(`group-${groupName}`);

              return (
                <div key={groupName} className="border-b border-border/50">
                  {/* Group header */}
                  <button
                    onClick={() => setOpenFinishCats(prev => {
                      const next = new Set(prev);
                      const key = `group-${groupName}`;
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    })}
                    className="w-full flex items-center justify-between py-5 group"
                    aria-expanded={isGroupOpen}
                  >
                    <h3 className="text-xs uppercase tracking-[0.2em] text-foreground font-bold group-hover:text-accent transition-colors">
                      {groupName}
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">({groupFinishes.length})</span>
                    </h3>
                    <ChevronDown size={18} className={`text-muted-foreground transition-transform duration-200 ${isGroupOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Subcategories inside group */}
                  {isGroupOpen && (
                    <div className="pb-4 animate-fade-in pl-4 border-l-2 border-accent/20 ml-2">
                      {groupCats.map(cat => {
                        const catFinishes = brandFinishes.filter(f => f.finish_category_id === cat.id);
                        if (catFinishes.length === 0) return null;
                        const isCatOpen = openFinishCats.has(cat.id);
                        return (
                          <div key={cat.id} className="border-b border-border/30 last:border-b-0">
                            <button
                              onClick={() => setOpenFinishCats(prev => {
                                const next = new Set(prev);
                                if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                                return next;
                              })}
                              className="w-full flex items-center justify-between py-3 group"
                              aria-expanded={isCatOpen}
                            >
                              <h4 className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                                {cat.name}
                                <span className="ml-2 text-[10px] font-normal text-muted-foreground/50">({catFinishes.length})</span>
                              </h4>
                              <ChevronDown size={14} className={`text-muted-foreground/50 transition-transform duration-200 ${isCatOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isCatOpen && (
                              <div className="pb-5 animate-fade-in">
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                                  {catFinishes.map(finish => (
                                    <button
                                      key={finish.id}
                                      onClick={() => setLightboxImage({ url: finish.image_url, name: finish.name })}
                                      className="group/fin text-center"
                                      aria-label={`Ver acabamento ${finish.name}`}
                                    >
                                      <div className="aspect-square rounded-sm overflow-hidden border border-border bg-card group-hover/fin:border-accent/50 group-hover/fin:shadow-md transition-all duration-200">
                                        <img src={finish.image_url} alt={finish.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                      </div>
                                      <p className="text-[9px] text-muted-foreground mt-1.5 truncate group-hover/fin:text-foreground transition-colors">
                                        {finish.name}
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {compositionRule && (loadingComposition || compositionProducts.length > 0) && (
          <section className="mt-16 md:mt-24 pt-12 border-t border-border" aria-labelledby="composition-heading">
            <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-medium">Composição sugerida</span>
                <h2 id="composition-heading" className="text-2xl md:text-3xl font-serif text-foreground mt-1">
                  {compositionRule.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-2">{compositionRule.description}</p>
              </div>
              {compositionProducts.length > 0 && (
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {compositionProducts.length} {compositionProducts.length === 1 ? 'sugestão' : 'sugestões'}
                </span>
              )}
            </div>

            {loadingComposition ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, index) => (
                  <div key={index}>
                    <div className="aspect-[4/5] w-full rounded-xl bg-muted animate-pulse mb-4" />
                    <div className="h-4 w-32 rounded bg-muted animate-pulse mb-2" />
                    <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {compositionProducts.map(item => (
                  <ProductCard
                    key={item.id}
                    product={item}
                    brandName={compositionBrandMap.get(item.brand_id) ?? ''}
                    showFavorite={false}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog open={showFinishPicker} onOpenChange={open => { if (!open) setShowFinishPicker(false); }}>
        <DialogContent className="sm:max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Selecionar Acabamentos</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Escolha até 2 acabamentos para salvar junto com o produto no projeto (opcional).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Selected finishes indicator */}
            {(selectedFinishId || selectedFinishId2) && (
              <div className="flex gap-2 items-center text-xs text-accent">
                <Check size={12} />
                <span>
                  {[selectedFinishId, selectedFinishId2].filter(Boolean).length} de 2 acabamento(s) selecionado(s)
                </span>
              </div>
            )}

            {/* Finish grid by category */}
            {filteredFinishCategories.map(cat => {
              const catFinishes = brandFinishes.filter(f => f.finish_category_id === cat.id);
              if (catFinishes.length === 0) return null;
              return (
                <div key={cat.id}>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-3">{cat.name}</p>
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                    {catFinishes.map(finish => {
                      const isSelected = selectedFinishId === finish.id || selectedFinishId2 === finish.id;
                      const selIndex = selectedFinishId === finish.id ? 1 : selectedFinishId2 === finish.id ? 2 : 0;
                      return (
                        <button
                          key={finish.id}
                          onClick={() => toggleFinishSelection(finish.id)}
                          className={`text-center transition-all relative ${
                            isSelected ? 'ring-2 ring-accent rounded-lg scale-105' : ''
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute -top-1 -right-1 z-10 w-4 h-4 bg-accent text-accent-foreground rounded-full text-[9px] flex items-center justify-center font-bold">
                              {selIndex}
                            </span>
                          )}
                          <div className={`aspect-square rounded-md overflow-hidden border ${
                            isSelected ? 'border-accent' : 'border-border'
                          }`}>
                            <img src={finish.image_url} alt={finish.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-[8px] text-muted-foreground mt-1 truncate">{finish.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Note field */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold block mb-2">
                Observação (opcional)
              </label>
              <textarea
                placeholder="Ex: verificar disponibilidade, cliente prefere tom mais claro..."
                value={projectNote}
                onChange={e => setProjectNote(e.target.value)}
                className="w-full min-h-[60px] px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={confirmAddWithFinish}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-xs uppercase tracking-[0.1em] font-medium hover:opacity-90 transition-opacity"
              >
                {selectedFinishId || selectedFinishId2 ? `Adicionar com ${[selectedFinishId, selectedFinishId2].filter(Boolean).length} Acabamento(s)` : 'Adicionar sem Acabamento'}
              </button>
              <button
                onClick={() => setShowFinishPicker(false)}
                className="px-4 py-2.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Designer bio dialog */}
      {designer && (
        <Dialog open={showDesignerInfo} onOpenChange={setShowDesignerInfo}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">{designer.name}</DialogTitle>
              <DialogDescription className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Designer
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-5 py-4">
              {designer.photo_url && (
                <img
                  src={designer.photo_url}
                  alt={designer.name}
                  className="w-28 h-28 rounded-full object-cover border border-border"
                />
              )}
              {designer.bio && (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap text-center">
                  {designer.bio}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
