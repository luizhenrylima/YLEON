import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2, X, Share2, Check, FileText, StickyNote, Upload, DollarSign, MapPin, ImageIcon, FolderOpen, GripVertical, Ruler } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { buildNewProjectPayload, projectMutationErrorMessage } from '@/lib/projectDefaults';
import { checkClientRateLimit, rateLimitMessage } from '@/lib/rateLimit';
import { firstZodMessage, projectDetailsSchema, projectItemUpdateSchema, projectNameSchema, sanitizePlainText, uploadFileSchema } from '@/lib/validation';
import logoYleon from '@/assets/logo-yleon.png';

interface Project {
  id: string;
  name: string;
  user_id: string;
  share_token: string | null;
  created_at: string;
  client_name: string | null;
  architect_name: string | null;
  consultant_name: string | null;
  crm_customer_id?: string | null;
  crm_architect_profile_id?: string | null;
  seller_user_id?: string | null;
  crm_status?: string | null;
  crm_tags?: string[] | null;
  initial_notes?: string | null;
  ownerName?: string;
  sellerName?: string;
}

interface Product {
  id: string;
  name: string;
  brand_id: string;
  category: string;
  description: string | null;
  images: string[] | null;
  ambient_images?: string[] | null;
}

interface Finish {
  id: string;
  name: string;
  image_url: string;
}

interface ProjectItemWithDetails {
  id: string;
  product_id: string;
  notes: string | null;
  selected_finish_id: string | null;
  selected_finish_id_2: string | null;
  environment_label: string | null;
  price: number | null;
  discount_price: number | null;
  quantity: number;
  presentation_image_2_index: number | null;
  presentation_dimensions: string | null;
  product?: Product;
  finish?: Finish | null;
  finish2?: Finish | null;
  brandName?: string;
}

interface EnvImage {
  id: string;
  project_id: string;
  environment_name: string;
  image_url: string;
  display_order: number;
}

const PROJECT_SELECT_FIELDS = 'id, name, user_id, share_token, created_at, client_name, architect_name, consultant_name, crm_customer_id, crm_architect_profile_id, seller_user_id, crm_status, crm_tags, initial_notes';
const PRODUCT_SELECT_FIELDS = 'id, name, brand_id, category, description, images, ambient_images';
const CUSTOMER_SELECT_FIELDS = 'id, name, seller_user_id, architect_profile_id, architect_name, phone, whatsapp, email, city, address, construction_address, construction_status, construction_deadline, move_in_deadline';

interface ProfileOption {
  user_id: string;
  full_name: string | null;
  seller_id?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface CrmCustomerOption {
  id: string;
  name: string;
  seller_user_id: string;
  architect_profile_id?: string | null;
  architect_name?: string | null;
}

export default function ProjectsPage() {
  const { user, isAdmin, isManager, isCeo, isSeller, isStaff } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectItems, setProjectItems] = useState<ProjectItemWithDetails[]>([]);
  const [envImages, setEnvImages] = useState<EnvImage[]>([]);
  const [newName, setNewName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newInitialNotes, setNewInitialNotes] = useState('');
  const [newArchitectId, setNewArchitectId] = useState('');
  const [newSellerId, setNewSellerId] = useState('');
  const [projectFilters, setProjectFilters] = useState({
    architect: '',
    client: '',
    status: '',
    tag: '',
    createdFrom: '',
  });
  const [currentProfile, setCurrentProfile] = useState<ProfileOption | null>(null);
  const [architectOptions, setArchitectOptions] = useState<ProfileOption[]>([]);
  const [sellerOptions, setSellerOptions] = useState<ProfileOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectItemWithDetails | null>(null);
  const [noteText, setNoteText] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    client_city: '',
    client_address: '',
    construction_status: '',
    construction_deadline: '',
    move_in_deadline: '',
    architect_name: '',
    consultant_name: '',
  });
  const [editingItem, setEditingItem] = useState<ProjectItemWithDetails | null>(null);
  const [itemForm, setItemForm] = useState({
    environment_label: '',
    price: '',
    discount_price: '',
    quantity: '1',
    presentation_image_2_index: '' as string,
    presentation_dimensions: '',
  });
  const [uploadingEnvImage, setUploadingEnvImage] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverEnv, setDragOverEnv] = useState<string | null>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const envImageInputRef = useRef<HTMLInputElement>(null);
  const canAssignSeller = isAdmin || isManager || isCeo;

  useEffect(() => {
    if (!user) return;
    const fetchProjects = async () => {
      let query = supabase.from('projects').select(PROJECT_SELECT_FIELDS).order('created_at', { ascending: false });
      if (!isStaff) query = query.eq('user_id', user.id);
      if (isSeller && !isAdmin) query = (supabase.from('projects').select(PROJECT_SELECT_FIELDS).or(`seller_user_id.eq.${user.id},user_id.eq.${user.id}`).order('created_at', { ascending: false }) as any);

      const { data } = await query;
      const fetchedProjects = (data as any as Project[]) || [];

      const ownerIds = [...new Set(fetchedProjects.flatMap(project => [project.user_id, project.seller_user_id]).filter(Boolean) as string[])];
      const { data: profiles } = ownerIds.length
        ? await supabase
          .from('profiles')
          .select('user_id, full_name, seller_id, phone, email')
          .in('user_id', ownerIds)
        : { data: [] as ProfileOption[] };
      const profileMap = new Map(((profiles || []) as ProfileOption[]).map(profile => [profile.user_id, profile]));
      setProjects(fetchedProjects.map(project => ({
        ...project,
        ownerName: profileMap.get(project.user_id)?.full_name || 'Sem nome',
        sellerName: project.seller_user_id ? profileMap.get(project.seller_user_id)?.full_name || 'Vendedor' : undefined,
      })));
      setLoading(false);
    };
    fetchProjects();
  }, [user, isStaff, isSeller, isAdmin]);

  useEffect(() => {
    if (!user) return;

    const fetchCommercialContext = async () => {
      const [{ data: profile }, { data: profiles }, { data: sellerRoles }, { data: customers }] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, seller_id, phone, email').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('user_id, full_name, seller_id, phone, email').order('full_name'),
        (supabase as any).from('user_roles').select('user_id, role').eq('role', 'vendedor'),
        (supabase as any).from('crm_customers').select('id, name, seller_user_id, architect_profile_id, architect_name').order('created_at', { ascending: false }),
      ]);
      setCurrentProfile((profile as ProfileOption | null) || null);
      const allProfiles = ((profiles || []) as ProfileOption[]).filter(profile => Boolean(profile.full_name));
      const sellerIds = new Set(((sellerRoles || []) as { user_id: string; role: string }[]).map(role => role.user_id));
      setArchitectOptions(
        isSeller
          ? allProfiles.filter(profile => profile.seller_id === user.id)
          : allProfiles.filter(profile => profile.user_id !== user.id)
      );
      setSellerOptions(allProfiles.filter(profile => sellerIds.has(profile.user_id)));
      setCustomerOptions((customers || []) as CrmCustomerOption[]);
    };

    void fetchCommercialContext();
  }, [user, isSeller]);

  const loadProjectItems = useCallback(async (project: Project) => {
    setSelectedProject(project);
    const [{ data: itemsData, error: itemsError }, { data: envImgs }] = await Promise.all([
      supabase.from('project_items').select('id, product_id, notes, selected_finish_id, selected_finish_id_2, environment_label, price, discount_price, quantity, presentation_image_2_index, presentation_dimensions').eq('project_id', project.id),
      supabase.from('project_environment_images').select('id, project_id, environment_name, image_url, display_order').eq('project_id', project.id).order('display_order'),
    ]);
    let items = itemsData;
    if (itemsError && /presentation_dimensions/i.test(itemsError.message)) {
      const { data: legacyItems } = await supabase
        .from('project_items')
        .select('id, product_id, notes, selected_finish_id, selected_finish_id_2, environment_label, price, discount_price, quantity, presentation_image_2_index')
        .eq('project_id', project.id);
      items = legacyItems;
    } else if (itemsError) {
      console.error('Project items load error:', itemsError);
    }

    setEnvImages((envImgs as any as EnvImage[]) || []);

    if (!items || items.length === 0) {
      setProjectItems([]);
      return;
    }

    const productIds = items.map(i => i.product_id);
    const finishIds = items
      .flatMap(i => [i.selected_finish_id, i.selected_finish_id_2])
      .filter((id): id is string => !!id);
    const [prodsRes, finishesRes] = await Promise.all([
      supabase.from('products').select(PRODUCT_SELECT_FIELDS).in('id', productIds),
      finishIds.length > 0 ? supabase.from('finishes').select('id, name, image_url').in('id', finishIds) : Promise.resolve({ data: [] as Finish[] }),
    ]);

    const products = prodsRes.data ?? [];
    const finishes = (finishesRes.data ?? []) as Finish[];

    const brandIds = [...new Set(products.map(p => p.brand_id))];
    const { data: brands } = await supabase.from('brands').select('id, name').in('id', brandIds);
    const brandMap = new Map((brands ?? []).map(b => [b.id, b.name]));
    const prodMap = new Map(products.map(p => [p.id, p]));
    const finishMap = new Map(finishes.map(f => [f.id, f]));

    const enriched: ProjectItemWithDetails[] = items.map(item => {
      const product = prodMap.get(item.product_id);
      return {
        ...item,
        presentation_image_2_index: (item as any).presentation_image_2_index ?? null,
        presentation_dimensions: (item as any).presentation_dimensions ?? null,
        product: product as Product | undefined,
        finish: item.selected_finish_id ? finishMap.get(item.selected_finish_id) ?? null : null,
        finish2: item.selected_finish_id_2 ? finishMap.get(item.selected_finish_id_2) ?? null : null,
        brandName: product ? brandMap.get(product.brand_id) ?? '' : '',
      };
    });

    setProjectItems(enriched);
  }, []);

  const createProject = async () => {
    if (!user) return;
    const projectName = (newProjectInputRef.current?.value || newName || '').trim();
    const parsed = projectNameSchema.safeParse(projectName);
    if (!parsed.success) {
      toast({ title: 'Confira o nome do projeto', description: firstZodMessage(parsed.error) });
      newProjectInputRef.current?.focus();
      return;
    }
    const clientName = sanitizePlainText(newClientName, 120);
    if (!clientName) {
      toast({ title: 'Informe o cliente', description: 'O nome do cliente final e obrigatorio para criar projeto.', variant: 'destructive' });
      return;
    }
    const rate = checkClientRateLimit('project:create', user.id);
    if (!rate.allowed) {
      toast({ title: 'Muitas tentativas', description: rateLimitMessage(rate), variant: 'destructive' });
      return;
    }
    setCreatingProject(true);

    try {
      const selectedArchitect = architectOptions.find(architect => architect.user_id === newArchitectId) || null;
      const selectedCustomer = customerOptions.find(customer => customer.name.toLowerCase().trim() === clientName.toLowerCase().trim()) || null;
      const sellerUserId = isSeller
        ? user.id
        : canAssignSeller
          ? newSellerId || selectedCustomer?.seller_user_id || null
          : currentProfile?.seller_id || selectedCustomer?.seller_user_id || null;
      const architectProfileId = isSeller
        ? selectedArchitect?.user_id || selectedCustomer?.architect_profile_id || null
        : user.id;
      const architectName = isSeller
        ? selectedArchitect?.full_name || selectedCustomer?.architect_name || ''
        : currentProfile?.full_name || '';
      const { data, error } = await (supabase as any)
        .from('projects')
        .insert(buildNewProjectPayload(user.id, parsed.data, {
          clientName,
          initialNotes: sanitizePlainText(newInitialNotes, 1000),
          sellerUserId,
          architectProfileId,
          architectName,
          customerId: selectedCustomer?.id || null,
        }))
        .select(PROJECT_SELECT_FIELDS)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Projeto nao retornou do banco.');

      setProjects(prev => [(data as Project), ...prev]);
      setNewName('');
      setNewClientName('');
      setNewInitialNotes('');
      setNewArchitectId('');
      setNewSellerId('');
      if (newProjectInputRef.current) newProjectInputRef.current.value = '';
      window.dispatchEvent(new CustomEvent('architect-onboarding:project-created', { detail: { projectId: data.id } }));
      toast({ title: 'Projeto criado', description: parsed.data });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Project creation error:', err);
      toast({
        title: 'Erro ao criar projeto',
        description: projectMutationErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setCreatingProject(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!user) return;
    const project = projects.find(item => item.id === id);
    if (!project) return;
    if (!window.confirm('Tem certeza que deseja arquivar este projeto? O historico sera preservado.')) return;

    const { error } = await (supabase as any)
      .from('projects')
      .update({ archived_at: new Date().toISOString(), archived_by: user.id })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao arquivar projeto', description: 'Verifique suas permissoes e tente novamente.', variant: 'destructive' });
      return;
    }
    setProjects(projects.filter(p => p.id !== id));
    if (selectedProject?.id === id) {
      setSelectedProject(null);
      setProjectItems([]);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!window.confirm('Remover este item do projeto?')) return;
    await supabase.from('project_items').delete().eq('id', itemId);
    setProjectItems(prev => prev.filter(i => i.id !== itemId));
  };

  const shareProject = async () => {
    if (!selectedProject) return;
    let token = selectedProject.share_token;
    if (!token) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      await supabase.from('projects').update({ share_token: token } as any).eq('id', selectedProject.id);
      setSelectedProject({ ...selectedProject, share_token: token });
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, share_token: token } as any : p));
    }
    const url = `${window.location.origin}/shared/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
      toast({ title: 'Link copiado!', description: 'Compartilhe com seus clientes.' });
    } catch {
      toast({ title: 'Link de compartilhamento', description: url });
    }
  };

  const saveNote = async () => {
    if (!editingNote) return;
    await supabase.from('project_items').update({ notes: noteText.trim() || null } as any).eq('id', editingNote.id);
    setProjectItems(prev => prev.map(i => i.id === editingNote.id ? { ...i, notes: noteText.trim() || null } : i));
    setEditingNote(null);
  };

  const openProjectEdit = async () => {
    if (!selectedProject) return;
    const nextForm = {
      client_name: selectedProject.client_name || '',
      client_phone: '',
      client_email: '',
      client_city: '',
      client_address: '',
      construction_status: '',
      construction_deadline: '',
      move_in_deadline: '',
      architect_name: selectedProject.architect_name || '',
      consultant_name: selectedProject.consultant_name || '',
    };

    const customerQuery = selectedProject.crm_customer_id
      ? (supabase as any).from('crm_customers').select(CUSTOMER_SELECT_FIELDS).eq('id', selectedProject.crm_customer_id).maybeSingle()
      : selectedProject.client_name
        ? (supabase as any).from('crm_customers').select(CUSTOMER_SELECT_FIELDS).eq('seller_user_id', selectedProject.seller_user_id || selectedProject.user_id).ilike('name', selectedProject.client_name).maybeSingle()
        : Promise.resolve({ data: null });

    const { data: customer } = await customerQuery;
    if (customer) {
      nextForm.client_phone = customer.whatsapp || customer.phone || '';
      nextForm.client_email = customer.email || '';
      nextForm.client_city = customer.city || '';
      nextForm.client_address = customer.address || customer.construction_address || '';
      nextForm.construction_status = customer.construction_status || '';
      nextForm.construction_deadline = customer.construction_deadline || '';
      nextForm.move_in_deadline = customer.move_in_deadline || '';
    }

    setProjectForm(nextForm);
    setEditingProject(true);
  };

  const saveProjectDetails = async () => {
    if (!selectedProject) return;
    const parsed = projectDetailsSchema.safeParse(projectForm);
    if (!parsed.success) {
      toast({ title: 'Confira os dados do cliente', description: firstZodMessage(parsed.error), variant: 'destructive' });
      return;
    }
    const rate = checkClientRateLimit('project:update', selectedProject.id);
    if (!rate.allowed) {
      toast({ title: 'Muitas atualizacoes', description: rateLimitMessage(rate), variant: 'destructive' });
      return;
    }
    let crmCustomerId = selectedProject.crm_customer_id || null;
    let architectProfileId = selectedProject.crm_architect_profile_id || null;
    const safeForm = parsed.data;
    const clientName = sanitizePlainText(safeForm.client_name || '', 120);
    const architectName = sanitizePlainText(safeForm.architect_name || '', 120);

    if (architectName) {
      const { data: architectProfiles } = await (supabase as any)
        .from('profiles')
        .select('user_id, full_name')
        .ilike('full_name', architectName)
        .limit(1);
      architectProfileId = architectProfiles?.[0]?.user_id || architectProfileId;
    }

    if (clientName) {
      const sellerUserId = selectedProject.seller_user_id || selectedProject.user_id;
      const customerPayload = {
        seller_user_id: sellerUserId,
        name: clientName,
        phone: sanitizePlainText(safeForm.client_phone || '', 32) || null,
        whatsapp: sanitizePlainText(safeForm.client_phone || '', 32) || null,
        email: safeForm.client_email?.trim() || null,
        city: sanitizePlainText(safeForm.client_city || '', 80) || null,
        address: sanitizePlainText(safeForm.client_address || '', 220) || null,
        construction_address: sanitizePlainText(safeForm.client_address || '', 220) || null,
        construction_status: sanitizePlainText(safeForm.construction_status || '', 80) || null,
        construction_deadline: safeForm.construction_deadline || null,
        move_in_deadline: safeForm.move_in_deadline || null,
        architect_name: architectName || null,
        architect_profile_id: architectProfileId,
        lead_source: 'Projeto',
        customer_type: 'residencial',
        urgency_level: 'media',
        status: 'ativo',
      };

      const customerRequest = crmCustomerId
        ? (supabase as any).from('crm_customers').update(customerPayload).eq('id', crmCustomerId).select('id').single()
        : (supabase as any).from('crm_customers').insert(customerPayload).select('id').single();
      const { data: savedCustomer, error: customerError } = await customerRequest;
      if (!customerError && savedCustomer?.id) crmCustomerId = savedCustomer.id;
    }

    await (supabase as any).from('projects').update({
      client_name: clientName || null,
      architect_name: architectName || null,
      consultant_name: sanitizePlainText(safeForm.consultant_name || '', 120) || null,
      crm_customer_id: crmCustomerId,
      crm_architect_profile_id: architectProfileId,
      seller_user_id: selectedProject.seller_user_id || selectedProject.user_id,
    }).eq('id', selectedProject.id);
    const updated = {
      ...selectedProject,
      client_name: clientName || null,
      architect_name: architectName || null,
      consultant_name: sanitizePlainText(safeForm.consultant_name || '', 120) || null,
      crm_customer_id: crmCustomerId,
      crm_architect_profile_id: architectProfileId,
      seller_user_id: selectedProject.seller_user_id || selectedProject.user_id,
    };
    setSelectedProject(updated);
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? updated : p));
    setEditingProject(false);
    toast({ title: 'Dados atualizados!' });
  };

  const openItemEdit = (item: ProjectItemWithDetails) => {
    setEditingItem(item);
    setItemForm({
      environment_label: item.environment_label || '',
      price: item.price != null ? String(item.price) : '',
      discount_price: item.discount_price != null ? String(item.discount_price) : '',
      quantity: String(item.quantity || 1),
      presentation_image_2_index: item.presentation_image_2_index != null ? String(item.presentation_image_2_index) : '',
      presentation_dimensions: item.presentation_dimensions || '',
    });
  };

  const saveItemDetails = async () => {
    if (!editingItem) return;
    const normalized = {
      environment_label: itemForm.environment_label,
      price: itemForm.price ? Number(itemForm.price.replace(',', '.')) : null,
      discount_price: itemForm.discount_price ? Number(itemForm.discount_price.replace(',', '.')) : null,
      quantity: itemForm.quantity ? Number(itemForm.quantity) : 1,
      presentation_image_2_index: itemForm.presentation_image_2_index !== '' ? Number(itemForm.presentation_image_2_index) : null,
      presentation_dimensions: itemForm.presentation_dimensions,
    };
    const parsed = projectItemUpdateSchema.safeParse(normalized);
    if (!parsed.success) {
      toast({ title: 'Confira os dados do item', description: firstZodMessage(parsed.error), variant: 'destructive' });
      return;
    }
    const rate = checkClientRateLimit('project:update', editingItem.id);
    if (!rate.allowed) {
      toast({ title: 'Muitas atualizacoes', description: rateLimitMessage(rate), variant: 'destructive' });
      return;
    }
    const updates: any = {
      environment_label: sanitizePlainText(parsed.data.environment_label || '', 80) || null,
      price: parsed.data.price,
      discount_price: parsed.data.discount_price,
      quantity: parsed.data.quantity,
      presentation_image_2_index: parsed.data.presentation_image_2_index,
      presentation_dimensions: sanitizePlainText(parsed.data.presentation_dimensions || '', 160) || null,
    };
    const { error } = await supabase.from('project_items').update(updates).eq('id', editingItem.id);
    let savedUpdates = updates;
    if (error && /presentation_dimensions/i.test(error.message)) {
      const { presentation_dimensions, ...legacyUpdates } = updates;
      const { error: legacyError } = await supabase.from('project_items').update(legacyUpdates).eq('id', editingItem.id);
      if (legacyError) {
        toast({ title: 'Erro ao atualizar item', description: 'Tente novamente.', variant: 'destructive' });
        return;
      }
      savedUpdates = legacyUpdates;
      toast({ title: 'Item atualizado', description: 'Aplique a migracao para salvar as medidas.' });
    } else if (error) {
      toast({ title: 'Erro ao atualizar item', description: 'Tente novamente.', variant: 'destructive' });
      return;
    }
    setProjectItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...savedUpdates } : i));
    setEditingItem(null);
    if (!error) toast({ title: 'Item atualizado!' });
  };

  const moveItemToEnvironment = async (itemId: string, envName: string) => {
    const nextEnv = envName === 'Sem ambiente' ? null : envName;
    const previousItems = projectItems;

    setProjectItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, environment_label: nextEnv } : item
    ));
    setDraggedItemId(null);
    setDragOverEnv(null);

    const { error } = await supabase
      .from('project_items')
      .update({ environment_label: nextEnv } as any)
      .eq('id', itemId);

    if (error) {
      setProjectItems(previousItems);
      toast({ title: 'Erro ao mover produto', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleEnvImageUpload = async (envName: string, file: File) => {
    if (!selectedProject) return;
    const parsed = uploadFileSchema.safeParse({ name: file.name, size: file.size, type: file.type });
    if (!parsed.success) {
      toast({ title: 'Arquivo invalido', description: firstZodMessage(parsed.error), variant: 'destructive' });
      return;
    }
    const rate = checkClientRateLimit('upload:image', selectedProject.id);
    if (!rate.allowed) {
      toast({ title: 'Muitos uploads', description: rateLimitMessage(rate), variant: 'destructive' });
      return;
    }
    setUploadingEnvImage(envName);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `env-images/${selectedProject.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      const imageUrl = urlData.publicUrl;

      const existing = envImages.find(e => e.environment_name === envName);
      if (existing) {
        await supabase.from('project_environment_images').update({ image_url: imageUrl } as any).eq('id', existing.id);
        setEnvImages(prev => prev.map(e => e.id === existing.id ? { ...e, image_url: imageUrl } : e));
      } else {
        const { data } = await supabase.from('project_environment_images').insert({
          project_id: selectedProject.id,
          environment_name: envName,
          image_url: imageUrl,
        } as any).select().single();
        if (data) setEnvImages(prev => [...prev, data as any as EnvImage]);
      }
      toast({ title: 'Imagem do ambiente enviada!' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
    } finally {
      setUploadingEnvImage(null);
    }
  };

  // Group items by environment
  const groupedItems = projectItems.reduce<Record<string, ProjectItemWithDetails[]>>((acc, item) => {
    const env = item.environment_label || 'Sem ambiente';
    if (!acc[env]) acc[env] = [];
    acc[env].push(item);
    return acc;
  }, {});

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getSecondaryImageOptions = (product?: Product) => {
    const productImages = product?.images || [];
    const ambientImages = product?.ambient_images || [];
    return [
      ...productImages.slice(1).map((url, idx) => ({
        value: String(idx + 1),
        url,
        label: `Imagem ${idx + 2}`,
        source: 'Produto',
      })),
      ...ambientImages.map((url, idx) => ({
        value: String(productImages.length + idx),
        url,
        label: `Ambientada ${idx + 1}`,
        source: 'Ambientada',
      })),
    ];
  };

  // ============ PDF GENERATION (Admin only) ============
  const generateMoodboard = async () => {
    if (!selectedProject || projectItems.length === 0) return;
    setGeneratingPdf(true);

    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = 297;
      const pageH = 210;

      const loadImage = (url: string, format: 'JPEG' | 'PNG' = 'JPEG'): Promise<{ data: string; w: number; h: number } | null> => {
        return new Promise((resolve) => {
          try {
            void (async () => {
              const response = await fetch(url);
              if (!response.ok) { resolve(null); return; }
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) { URL.revokeObjectURL(objectUrl); resolve(null); return; }
                if (format === 'PNG') ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                try {
                  const data = canvas.toDataURL(format === 'PNG' ? 'image/png' : 'image/jpeg', 0.92);
                  URL.revokeObjectURL(objectUrl);
                  resolve({ data, w: img.naturalWidth, h: img.naturalHeight });
                } catch {
                  URL.revokeObjectURL(objectUrl);
                  resolve(null);
                }
              };
              img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
              img.src = objectUrl;
            })();
          } catch {
            resolve(null);
          }
        });
      };

      const fitImage = (imgW: number, imgH: number, boxW: number, boxH: number) => {
        const ratio = Math.min(boxW / imgW, boxH / imgH);
        const w = imgW * ratio;
        const h = imgH * ratio;
        return { w, h, offsetX: (boxW - w) / 2, offsetY: (boxH - h) / 2 };
      };

      const coverImage = (imgW: number, imgH: number, boxW: number, boxH: number) => {
        const ratio = Math.max(boxW / imgW, boxH / imgH);
        const w = imgW * ratio;
        const h = imgH * ratio;
        return { w, h, offsetX: (boxW - w) / 2, offsetY: (boxH - h) / 2 };
      };

      const logoData = await loadImage(logoYleon, 'PNG');
      const black = [10, 10, 9] as const;
      const offBlack = [24, 24, 22] as const;
      const white = [255, 255, 255] as const;
      const paper = [248, 247, 244] as const;
      const textMain = [31, 31, 28] as const;
      const goldSoft = [226, 203, 142] as const;
      const gold = [185, 149, 72] as const;
      const muted = [132, 128, 118] as const;

      type ImgData = { data: string; w: number; h: number } | null;
      const preloadedImages = await Promise.all(
        projectItems.map(async (item) => {
          const productImages = item.product?.images || [];
          const ambientImages = item.product?.ambient_images || [];
          const selectedSecondary = getSecondaryImageOptions(item.product).find(option => option.value === String(item.presentation_image_2_index));
          const secondaryImgUrl = selectedSecondary?.url || productImages[1] || ambientImages[0] || null;
          const [productImg, secondaryImg, finishImg, finishImg2] = await Promise.all([
            productImages[0] ? loadImage(productImages[0]) : Promise.resolve(null),
            secondaryImgUrl ? loadImage(secondaryImgUrl) : Promise.resolve(null),
            item.finish?.image_url ? loadImage(item.finish.image_url) : Promise.resolve(null),
            item.finish2?.image_url ? loadImage(item.finish2.image_url) : Promise.resolve(null),
          ]);
          return { productImg, secondaryImg, productImg2: secondaryImg, finishImg, finishImg2 };
        })
      );

      const envImageMap = new Map<string, ImgData>();
      await Promise.all(
        envImages.map(async (ei) => {
          const img = await loadImage(ei.image_url);
          if (img) envImageMap.set(ei.environment_name, img);
        })
      );

      const environments = Object.keys(groupedItems);
      // total pages = 1 YLEON cover + envs(opt) + items
      let totalPages = 1;
      for (const env of environments) {
        if (envImageMap.has(env)) totalPages++;
        totalPages += groupedItems[env].length;
      }

      const drawHeader = (pageNum: number) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...muted);
        doc.text(`${pageNum} / ${totalPages}`, pageW - 12, 8, { align: 'right' });
      };

      const drawFooter = () => {
        const footerY = pageH - 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...muted);
        doc.text('YLEON', 15, footerY);
      };

      // ===== COVER - YLEON project presentation =====
      const rightPanelW = pageW * 0.16;
      const rightPanelX = pageW - rightPanelW;
      const coverPadX = 23;
      doc.setFillColor(...black);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFillColor(...offBlack);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFillColor(...paper);
      doc.rect(rightPanelX, 0, rightPanelW, pageH, 'F');

      doc.setDrawColor(...gold);
      doc.setLineWidth(0.65);
      doc.line(coverPadX, 22, coverPadX + 60, 22);
      doc.line(rightPanelX, 20, rightPanelX, pageH - 20);

      if (logoData) {
        doc.setFillColor(...paper);
        doc.rect(coverPadX, 34, 83.5, 32.5, 'F');
        doc.setDrawColor(...gold);
        doc.setLineWidth(0.35);
        doc.rect(coverPadX, 34, 83.5, 32.5);
        doc.rect(coverPadX + 1.4, 35.4, 80.7, 29.7);
        const logoFit = fitImage(logoData.w, logoData.h, 64, 24);
        doc.addImage(logoData.data, 'PNG', coverPadX + 9.75 + logoFit.offsetX, 38.25 + logoFit.offsetY, logoFit.w, logoFit.h);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(...goldSoft);
        doc.text('YLEON', coverPadX, 58);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...goldSoft);
      doc.text('APRESENTACAO DO PROJETO', coverPadX, 83);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(23);
      doc.setTextColor(...white);
      const coverTitleLines = doc.splitTextToSize(selectedProject.name.toUpperCase(), 126);
      doc.text(coverTitleLines.slice(0, 4), coverPadX, 99);

      let coverInfoY = 139;
      const coverInfo: [string, string | null | undefined][] = [
        ['Cliente', selectedProject.client_name],
        ['Arquiteto', selectedProject.architect_name],
        ['Consultor', selectedProject.consultant_name],
      ];
      for (const [label, value] of coverInfo) {
        if (!value) continue;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...goldSoft);
        doc.text(label.toUpperCase(), coverPadX, coverInfoY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...white);
        doc.text(doc.splitTextToSize(value, 120).slice(0, 2), coverPadX, coverInfoY + 6);
        coverInfoY += 19;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...goldSoft);
      doc.text(`Data da proposta: ${new Date().toLocaleDateString('pt-BR')}`, coverPadX, 178);
      doc.text('Colecao de pecas, acabamentos e valores para o projeto.', coverPadX, 188);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(36);
      doc.setTextColor(...gold);
      doc.text('YLEON', rightPanelX + rightPanelW / 2 + 2, pageH / 2 + 31, { angle: 90, align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...muted);
      doc.text(`1 / ${totalPages}`, pageW - 14, 195, { align: 'right' });

      // ===== PRODUCT PAGES BY ENVIRONMENT =====
      let currentPage = 1;

      for (const env of environments) {
        const items = groupedItems[env];

        const envImg = envImageMap.get(env);
        if (envImg) {
          doc.addPage();
          currentPage++;
          const fit = fitImage(envImg.w, envImg.h, pageW, pageH);
          doc.addImage(envImg.data, 'JPEG', fit.offsetX, fit.offsetY, fit.w, fit.h, undefined, 'FAST');
          doc.setFillColor(0, 0, 0);
          doc.setGState(new (doc as any).GState({ opacity: 0.5 }));
          doc.rect(0, pageH - 50, pageW, 50, 'F');
          doc.setGState(new (doc as any).GState({ opacity: 1 }));
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(24);
          doc.setTextColor(255, 255, 255);
          doc.text(env.toUpperCase(), pageW / 2, pageH - 25, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.text(`${items.length} ${items.length === 1 ? 'produto' : 'produtos'}`, pageW / 2, pageH - 17, { align: 'center' });
        }

        for (let i = 0; i < items.length; i++) {
          doc.addPage();
          currentPage++;
          const item = items[i];
          const itemIndex = projectItems.indexOf(item);
          const cachedImg = preloadedImages[itemIndex];

          // Three-column layout per spec: 32% / 38% / 30%
          const colLW = pageW * 0.32;
          const colCW = pageW * 0.38;
          const colRW = pageW * 0.30;
          const colLX = 0;
          const colCX = colLW;
          const colRX = colLW + colCW;

          // === LEFT COLUMN (black) ===
          doc.setFillColor(...offBlack);
          doc.rect(colLX, 0, colLW, pageH, 'F');

          // Title (uppercase) at top
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(255, 255, 255);
          const titlePad = 12;
          const titleLines = doc.splitTextToSize((item.product?.name || '').toUpperCase(), colLW - titlePad * 2);
          doc.text(titleLines, colLX + titlePad, 22);

          // Main product image stays over the offBlack band.
          const detailImg = cachedImg?.productImg || null;
          if (detailImg) {
            const dBoxW = colLW - 24;
            const dBoxH = pageH * 0.45;
            const dY = (pageH - dBoxH) / 2 - 8;
            const dFit = fitImage(detailImg.w, detailImg.h, dBoxW, dBoxH);
            doc.addImage(detailImg.data, 'JPEG', colLX + 12 + (dBoxW - dFit.w) / 2, dY + (dBoxH - dFit.h) / 2, dFit.w, dFit.h, undefined, 'FAST');
          }

          // Footer note
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(230, 225, 215);
          const footerNote = [
            'As imagens dos produtos são meramente ilustrativas.',
            'Os valores podem variar conforme acabamento, tecido e medidas.',
            'Validade da proposta: 07 dias',
          ];
          let fnY = pageH - 22;
          footerNote.forEach((line) => {
            doc.text(line, colLX + titlePad, fnY);
            fnY += 4;
          });

          // === CENTER COLUMN (white, secondary/lifestyle image + measures) ===
          doc.setFillColor(255, 255, 255);
          doc.rect(colCX, 0, colCW, pageH, 'F');

          if (cachedImg?.secondaryImg) {
            const cBoxW = colCW - 16;
            const cBoxH = pageH * 0.62;
            const cY = (pageH - cBoxH) / 2 - 10;
            const cFit = fitImage(cachedImg.secondaryImg.w, cachedImg.secondaryImg.h, cBoxW, cBoxH);
            doc.addImage(cachedImg.secondaryImg.data, 'JPEG', colCX + 8 + (cBoxW - cFit.w) / 2, cY + (cBoxH - cFit.h) / 2, cFit.w, cFit.h, undefined, 'FAST');
          } else {
            doc.setFillColor(245, 243, 240);
            doc.rect(colCX + 8, 30, colCW - 16, pageH * 0.62, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(200, 195, 185);
            doc.text('Imagem secundaria', colCX + colCW / 2, pageH / 2, { align: 'center' });
          }

          // Measures below image, filled by seller/project editor.
          const measuresText = item.presentation_dimensions?.trim() || 'Medidas a confirmar';
          if (measuresText) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...textMain);
            const mLines = doc.splitTextToSize(measuresText, colCW - 20);
            const shown = mLines.slice(0, 4);
            doc.text(shown, colCX + colCW / 2, pageH - 28, { align: 'center' });
          }

          // === RIGHT COLUMN (white, info) ===
          doc.setFillColor(255, 255, 255);
          doc.rect(colRX, 0, colRW, pageH, 'F');

          const rPad = 10;
          let ry = 22;

          // Logo
          if (logoData) {
            const lh = fitImage(logoData.w, logoData.h, colRW - rPad * 2, 18);
            doc.addImage(logoData.data, 'PNG', colRX + rPad + lh.offsetX, ry + lh.offsetY, lh.w, lh.h);
            ry += 26;
          }

          // Brand
          if (item.brandName) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...gold);
            doc.text(item.brandName.toUpperCase(), colRX + rPad, ry);
            ry += 5;
          }

          // Product name
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(...textMain);
          const pNameLines = doc.splitTextToSize(item.product?.name || '', colRW - rPad * 2);
          doc.text(pNameLines, colRX + rPad, ry + 2);
          ry += pNameLines.length * 6 + 8;

          // Category
          if (item.product?.category) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...muted);
            doc.text(item.product.category.toUpperCase(), colRX + rPad, ry);
            ry += 8;
          }

          // Divider
          doc.setDrawColor(...goldSoft);
          doc.setLineWidth(0.4);
          doc.line(colRX + rPad, ry, colRX + colRW - rPad, ry);
          ry += 8;

          // Finishes
          const finishesToRender = [
            { finish: item.finish, img: cachedImg?.finishImg },
            { finish: item.finish2, img: cachedImg?.finishImg2 },
          ].filter(f => f.finish);

          if (finishesToRender.length > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...gold);
            doc.text(finishesToRender.length > 1 ? 'ACABAMENTOS' : 'ACABAMENTO', colRX + rPad, ry);
            ry += 5;
            for (const { finish, img } of finishesToRender) {
              if (!finish) continue;
              const sw = 14;
              if (img) {
                const sf = fitImage(img.w, img.h, sw, sw);
                doc.addImage(img.data, 'JPEG', colRX + rPad + sf.offsetX, ry + sf.offsetY, sf.w, sf.h, undefined, 'FAST');
              } else {
                doc.setFillColor(240, 238, 234);
                doc.rect(colRX + rPad, ry, sw, sw, 'F');
              }
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(...textMain);
              const fNameLines = doc.splitTextToSize(finish.name, colRW - rPad * 2 - sw - 4);
              doc.text(fNameLines.slice(0, 2), colRX + rPad + sw + 4, ry + sw / 2 + 1);
              ry += sw + 4;
            }
            ry += 4;
          }

          // Prices
          if (item.price != null || item.discount_price != null) {
            doc.setDrawColor(...goldSoft);
            doc.setLineWidth(0.4);
            doc.line(colRX + rPad, ry, colRX + colRW - rPad, ry);
            ry += 7;

            const qty = item.quantity || 1;
            const unitPrice = item.discount_price ?? item.price ?? 0;

            if (item.price != null) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(...muted);
              doc.text('PREÇO ORIGINAL', colRX + rPad, ry);
              ry += 5;
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(11);
              doc.setTextColor(...muted);
              const origText = formatCurrency(item.price);
              doc.text(origText, colRX + rPad, ry);
              if (item.discount_price != null) {
                const tw = doc.getTextWidth(origText);
                doc.setDrawColor(...muted);
                doc.setLineWidth(0.3);
                doc.line(colRX + rPad, ry - 1.2, colRX + rPad + tw, ry - 1.2);
              }
              ry += 8;
            }

            if (item.discount_price != null) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(...gold);
              doc.text('PREÇO PROMOCIONAL', colRX + rPad, ry);
              ry += 5;
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(14);
              doc.setTextColor(...textMain);
              doc.text(formatCurrency(item.discount_price), colRX + rPad, ry);
              ry += 9;
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...muted);
            doc.text(`QUANTIDADE: ${qty}`, colRX + rPad, ry);
            ry += 5;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...gold);
            doc.text('VALOR TOTAL', colRX + rPad, ry);
            ry += 5;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...textMain);
            doc.text(formatCurrency(unitPrice * qty), colRX + rPad, ry);
            ry += 8;
          }

          // Page number on right column bottom
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(...muted);
          doc.text(`${currentPage} / ${totalPages}`, colRX + colRW - rPad, pageH - 8, { align: 'right' });
        }
      }


      doc.save(`${selectedProject.name.replace(/\s+/g, '_')}_apresentacao.pdf`);
      toast({ title: 'Apresentação gerada!', description: 'PDF profissional baixado com sucesso.' });
    } catch (err) {
      console.error('Moodboard PDF error:', err);
      toast({ title: 'Erro ao gerar PDF', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ============ RENDER ============
  const canManageProjects = isStaff;
  const pageTitle = isAdmin ? 'Todos os Projetos' : isSeller ? 'Painel do Vendedor' : 'Meus Projetos';
  const PageIcon = canManageProjects ? Pencil : FolderOpen;
  const filteredProjects = projects.filter(project => {
    const architect = (project.architect_name || project.ownerName || '').toLowerCase();
    const client = (project.client_name || '').toLowerCase();
    const tags = (project.crm_tags || []).join(' ').toLowerCase();
    const createdAt = project.created_at ? project.created_at.slice(0, 10) : '';
    return (
      (!projectFilters.architect || architect.includes(projectFilters.architect.toLowerCase()))
      && (!projectFilters.client || client.includes(projectFilters.client.toLowerCase()))
      && (!projectFilters.status || project.crm_status === projectFilters.status)
      && (!projectFilters.tag || tags.includes(projectFilters.tag.toLowerCase()))
      && (!projectFilters.createdFrom || createdAt >= projectFilters.createdFrom)
    );
  });
  const groupedProjects = isSeller
    ? filteredProjects.reduce((groups, project) => {
      const key = project.architect_name || project.ownerName || 'Sem arquiteto vinculado';
      groups.set(key, [...(groups.get(key) || []), project]);
      return groups;
    }, new Map<string, Project[]>())
    : new Map<string, Project[]>([['Projetos', filteredProjects]]);

  return (
    <div className="min-h-screen bg-background py-10 md:py-14 px-6 md:px-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <PageIcon size={22} className="text-accent" />
          <h1 className="text-2xl md:text-3xl font-serif text-foreground">{pageTitle}</h1>
        </div>

        {/* Create Project */}
        <form
          className="mb-8 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void createProject();
          }}
        >
          <input
            ref={newProjectInputRef}
            name="projectName"
            placeholder="Nome do novo projeto..."
            onChange={e => setNewName(e.target.value)}
            onInput={e => setNewName((e.target as HTMLInputElement).value)}
            className="flex-1 max-w-md px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent transition-all"
            disabled={creatingProject}
          />
          <Input
            list="project-client-options"
            value={newClientName}
            onChange={event => setNewClientName(event.target.value)}
            placeholder="Nome do cliente final..."
            disabled={creatingProject}
            className="h-12 rounded-lg"
          />
          <datalist id="project-client-options">
            {customerOptions.map(customer => <option key={customer.id} value={customer.name} />)}
          </datalist>
          {canAssignSeller && (
            <select
              value={newSellerId}
              onChange={event => setNewSellerId(event.target.value)}
              className="h-12 rounded-lg border border-border bg-background px-3 text-sm text-foreground md:col-span-2"
              disabled={creatingProject}
            >
              <option value="">Vendedor responsavel (opcional)</option>
              {sellerOptions.map(seller => (
                <option key={seller.user_id} value={seller.user_id}>{seller.full_name}</option>
              ))}
            </select>
          )}
          {isSeller && (
            <select
              value={newArchitectId}
              onChange={event => setNewArchitectId(event.target.value)}
              className="h-12 rounded-lg border border-border bg-background px-3 text-sm text-foreground md:col-span-2"
              disabled={creatingProject}
            >
              <option value="">Arquiteto da carteira (opcional)</option>
              {architectOptions.map(architect => (
                <option key={architect.user_id} value={architect.user_id}>{architect.full_name}</option>
              ))}
            </select>
          )}
          <Textarea
            value={newInitialNotes}
            onChange={event => setNewInitialNotes(event.target.value)}
            placeholder="Observacoes iniciais..."
            className="min-h-12 resize-none rounded-lg md:col-span-2"
            disabled={creatingProject}
          />
          <button
            type="submit"
            disabled={creatingProject}
            className="h-12 px-6 bg-primary text-primary-foreground rounded-lg text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            <Plus size={16} /> {creatingProject ? 'Criando' : 'Criar'}
          </button>
        </form>

        <div className="mb-6 grid gap-2 rounded-xl border border-border/70 bg-card/70 p-3 md:grid-cols-5">
          <Input value={projectFilters.architect} onChange={event => setProjectFilters(current => ({ ...current, architect: event.target.value }))} placeholder="Filtrar arquiteto" />
          <Input value={projectFilters.client} onChange={event => setProjectFilters(current => ({ ...current, client: event.target.value }))} placeholder="Filtrar cliente" />
          <select value={projectFilters.status} onChange={event => setProjectFilters(current => ({ ...current, status: event.target.value }))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Status</option>
            <option value="novo_atendimento">Novo atendimento</option>
            <option value="briefing_visita">Briefing / visita</option>
            <option value="curadoria_produtos">Coleção</option>
            <option value="proposta_orcamento">Proposta</option>
            <option value="followup_negociacao">Negociacao</option>
            <option value="pedido_fechado">Pedido fechado</option>
          </select>
          <Input value={projectFilters.tag} onChange={event => setProjectFilters(current => ({ ...current, tag: event.target.value }))} placeholder="Tag" />
          <Input type="date" value={projectFilters.createdFrom} onChange={event => setProjectFilters(current => ({ ...current, createdFrom: event.target.value }))} />
        </div>

        {loading ? (
          <div className="h-[30vh] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Project List */}
            <div className="lg:col-span-3 space-y-2">
              {filteredProjects.length === 0 && (
                <p className="text-muted-foreground font-light italic text-sm">Nenhum projeto criado.</p>
              )}
              {[...groupedProjects.entries()].map(([groupName, groupProjects]) => (
                <div key={groupName} className="space-y-2">
                  {isSeller && <p className="px-1 pt-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{groupName}</p>}
                  {groupProjects.map(proj => (
                    <div
                      key={proj.id}
                      className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        selectedProject?.id === proj.id
                          ? 'bg-accent/5 border-accent/30 shadow-sm'
                          : 'bg-card border-border hover:bg-secondary hover:border-border'
                      }`}
                      onClick={() => loadProjectItems(proj)}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <PageIcon size={14} className={selectedProject?.id === proj.id ? 'text-accent shrink-0' : 'text-muted-foreground shrink-0'} />
                        <div className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">{proj.name}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{proj.client_name || 'Cliente nao informado'}</span>
                          {canManageProjects && proj.ownerName && (
                            <span className="block text-[10px] text-muted-foreground truncate">{proj.ownerName}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteProject(proj.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Project Content */}
            <div className="lg:col-span-9">
              {selectedProject ? (
                <>
                  {/* Project header with actions */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                    <div>
                      <h2 className="text-xl md:text-2xl font-serif text-foreground">{selectedProject.name}</h2>
                      {canManageProjects && (selectedProject.ownerName || selectedProject.client_name || selectedProject.architect_name || selectedProject.consultant_name) && (
                        <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                          {selectedProject.ownerName && <span>Arquiteto cadastrado: <span className="text-foreground font-medium">{selectedProject.ownerName}</span></span>}
                          {selectedProject.client_name && <span>Cliente: <span className="text-foreground font-medium">{selectedProject.client_name}</span></span>}
                          {selectedProject.architect_name && <span>Arquiteto: <span className="text-foreground font-medium">{selectedProject.architect_name}</span></span>}
                          {selectedProject.consultant_name && <span>Consultor: <span className="text-foreground font-medium">{selectedProject.consultant_name}</span></span>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {canManageProjects && (
                        <button
                          onClick={openProjectEdit}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border text-xs uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
                          title="Editar dados do projeto"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        onClick={shareProject}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-xs uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
                      >
                        {copiedShareLink ? <Check size={14} className="text-accent" /> : <Share2 size={14} />}
                        {copiedShareLink ? 'Copiado!' : 'Compartilhar'}
                      </button>
                      {canManageProjects && (
                        <button
                          onClick={generateMoodboard}
                          disabled={generatingPdf || projectItems.length === 0}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          <FileText size={14} />
                          {generatingPdf ? 'Gerando...' : 'Gerar Apresentação'}
                        </button>
                      )}
                    </div>
                  </div>

                  {projectItems.length === 0 ? (
                    <div className="h-[30vh] flex flex-col items-center justify-center text-muted-foreground">
                      <PageIcon size={40} className="mb-4 opacity-20" />
                      <p className="font-light italic text-sm">Nenhum produto neste projeto.</p>
                      <p className="text-xs mt-1">Adicione produtos via página do produto.</p>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      {Object.entries(groupedItems).map(([env, items]) => (
                        <div
                          key={env}
                          onDragOver={e => {
                            if (!draggedItemId) return;
                            e.preventDefault();
                            setDragOverEnv(env);
                          }}
                          onDragLeave={e => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            setDragOverEnv(prev => prev === env ? null : prev);
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            if (draggedItemId) void moveItemToEnvironment(draggedItemId, env);
                          }}
                          className={`rounded-2xl transition-colors ${dragOverEnv === env ? 'bg-accent/5 ring-1 ring-accent/30' : ''}`}
                        >
                          {/* Environment header */}
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/50">
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="text-accent" />
                              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground">{env}</h3>
                              <span className="text-[10px] text-muted-foreground">({items.length} {items.length === 1 ? 'item' : 'itens'})</span>
                            </div>
                            {canManageProjects && env !== 'Sem ambiente' && (
                              <div className="flex items-center gap-2">
                                {envImages.find(e => e.environment_name === env) && (
                                  <div className="w-8 h-8 rounded border border-border overflow-hidden">
                                    <img src={envImages.find(e => e.environment_name === env)!.image_url} className="w-full h-full object-cover" alt="" />
                                  </div>
                                )}
                                <button
                                  onClick={() => {
                                    setUploadingEnvImage(env);
                                    envImageInputRef.current?.click();
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                                >
                                  <ImageIcon size={12} />
                                  {envImages.find(e => e.environment_name === env) ? 'Trocar imagem' : 'Imagem do ambiente'}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Items grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                            {items.map(item => {
                              return (
                                <div
                                  key={item.id}
                                  draggable
                                  onDragStart={e => {
                                    setDraggedItemId(item.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', item.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedItemId(null);
                                    setDragOverEnv(null);
                                  }}
                                  className={`group relative bg-card rounded-xl border border-border overflow-hidden card-hover ${draggedItemId === item.id ? 'opacity-50' : ''}`}
                                >
                                  <Link to={`/product/${item.product_id}`}>
                                    <div className="aspect-[4/5] bg-muted/30 flex items-center justify-center p-3">
                                      <img
                                        src={item.product?.images?.[0] || '/placeholder.svg'}
                                        className="max-w-full max-h-full object-contain"
                                        alt={item.product?.name || 'Produto'}
                                        loading="lazy"
                                      />
                                    </div>
                                  </Link>

                                  {/* Remove button */}
                                  <button
                                    onClick={() => removeItem(item.id)}
                                    className="absolute top-3 right-3 p-2 bg-card/80 backdrop-blur-sm rounded-full border border-border text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                  >
                                    <X size={14} />
                                  </button>

                                  <div className="absolute top-3 left-3 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm border border-border bg-card/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                    <GripVertical size={12} />
                                    Arrastar
                                  </div>

                                  <div className="p-4 space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{item.brandName}</p>
                                    <h3 className="text-sm font-medium text-foreground">{item.product?.name}</h3>
                                    <p className="text-[10px] text-muted-foreground capitalize">{item.product?.category}</p>

                                    {item.environment_label && (
                                      <div className="flex items-center gap-1 text-[10px] text-accent/80">
                                        <MapPin size={10} />
                                        {item.environment_label}
                                      </div>
                                    )}

                                    {item.presentation_dimensions && (
                                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Ruler size={10} />
                                        {item.presentation_dimensions}
                                      </div>
                                    )}

                                    {/* Pricing (admin only display) */}
                                    {canManageProjects && (item.price != null || item.discount_price != null) && (
                                      <div className="pt-1 space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          {item.discount_price != null && item.price != null ? (
                                            <>
                                              <span className="text-xs text-muted-foreground line-through">{formatCurrency(item.price)}</span>
                                              <span className="text-sm font-semibold text-foreground">{formatCurrency(item.discount_price)}</span>
                                            </>
                                          ) : item.price != null ? (
                                            <span className="text-sm font-semibold text-foreground">{formatCurrency(item.price)}</span>
                                          ) : null}
                                        </div>
                                        {(item.quantity || 1) > 1 && (
                                          <div className="text-[10px] text-muted-foreground">
                                            {item.quantity} un. — Total: <span className="font-semibold text-foreground">{formatCurrency((item.discount_price ?? item.price ?? 0) * (item.quantity || 1))}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Finishes */}
                                    {(item.finish || item.finish2) && (
                                      <div className="space-y-2 pt-2 border-t border-border/50">
                                        {[item.finish, item.finish2].filter(Boolean).map((f, idx) => (
                                          <div key={idx} className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded border border-border overflow-hidden shrink-0">
                                              <img src={f!.image_url} alt={f!.name} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Acabamento {idx + 1}</p>
                                              <p className="text-[11px] text-foreground">{f!.name}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Actions row */}
                                    <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                                      <button
                                        onClick={() => openItemEdit(item)}
                                        className="text-[10px] text-muted-foreground hover:text-accent transition-colors flex items-center gap-1"
                                      >
                                        <Pencil size={10} /> Editar detalhes
                                      </button>
                                      <span className="text-border">|</span>
                                      {item.notes ? (
                                        <button
                                          onClick={() => { setEditingNote(item); setNoteText(item.notes || ''); }}
                                          className="flex items-start gap-1 text-left group/note"
                                        >
                                          <StickyNote size={10} className="text-accent mt-0.5 shrink-0" />
                                          <p className="text-[10px] text-muted-foreground italic group-hover/note:text-foreground transition-colors truncate max-w-[120px]">
                                            {item.notes}
                                          </p>
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => { setEditingNote(item); setNoteText(''); }}
                                          className="text-[10px] text-muted-foreground hover:text-accent transition-colors flex items-center gap-1"
                                        >
                                          <Plus size={10} /> Observação
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="h-[40vh] flex flex-col items-center justify-center text-muted-foreground">
                  <PageIcon size={48} className="mb-4 opacity-15" />
                  <p className="font-light italic">Selecione um projeto para ver os produtos.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input for environment images */}
      <input
        ref={envImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && uploadingEnvImage) {
            handleEnvImageUpload(uploadingEnvImage, file);
          }
          e.target.value = '';
        }}
      />

      {/* Note Edit Modal */}
      <Dialog open={!!editingNote} onOpenChange={open => { if (!open) setEditingNote(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <StickyNote size={16} className="text-accent" />
              Observação do Produto
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editingNote?.product?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Ex: cliente gostou deste modelo, verificar disponibilidade..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="min-h-[80px] text-sm bg-secondary border-border resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveNote}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-xs uppercase tracking-[0.1em] font-medium hover:opacity-90 transition-opacity"
              >
                Salvar
              </button>
              <button
                onClick={() => setEditingNote(null)}
                className="px-4 py-2.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Project Details Edit Modal (Admin only) */}
      {canManageProjects && (
        <Dialog open={editingProject} onOpenChange={setEditingProject}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-serif text-lg flex items-center gap-2">
                <Pencil size={16} className="text-accent" />
                Dados da Apresentação
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Esses dados aparecerão na capa da apresentação PDF.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Nome do Cliente</label>
                <Input
                  value={projectForm.client_name}
                  onChange={e => setProjectForm(p => ({ ...p, client_name: e.target.value }))}
                  placeholder="Ex: João Silva"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">WhatsApp</label>
                  <Input value={projectForm.client_phone} onChange={e => setProjectForm(p => ({ ...p, client_phone: e.target.value }))} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">E-mail</label>
                  <Input type="email" value={projectForm.client_email} onChange={e => setProjectForm(p => ({ ...p, client_email: e.target.value }))} placeholder="cliente@email.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Cidade</label>
                  <Input value={projectForm.client_city} onChange={e => setProjectForm(p => ({ ...p, client_city: e.target.value }))} placeholder="Cidade" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Endereco / obra</label>
                  <Input value={projectForm.client_address} onChange={e => setProjectForm(p => ({ ...p, client_address: e.target.value }))} placeholder="Endereco da obra" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Andamento da obra</label>
                <Input value={projectForm.construction_status} onChange={e => setProjectForm(p => ({ ...p, construction_status: e.target.value }))} placeholder="Ex: acabamento, obra civil, entrega das chaves..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Prazo da obra</label>
                  <Input type="date" value={projectForm.construction_deadline} onChange={e => setProjectForm(p => ({ ...p, construction_deadline: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Prazo mudanca</label>
                  <Input type="date" value={projectForm.move_in_deadline} onChange={e => setProjectForm(p => ({ ...p, move_in_deadline: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Nome do Arquiteto</label>
                <Input
                  value={projectForm.architect_name}
                  onChange={e => setProjectForm(p => ({ ...p, architect_name: e.target.value }))}
                  placeholder="Ex: Maria Oliveira"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Nome do Consultor</label>
                <Input
                  value={projectForm.consultant_name}
                  onChange={e => setProjectForm(p => ({ ...p, consultant_name: e.target.value }))}
                  placeholder="Ex: Carlos Souza"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveProjectDetails}
                  className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-xs uppercase tracking-[0.1em] font-medium hover:opacity-90 transition-opacity"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingProject(false)}
                  className="px-4 py-2.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Item Details Edit Modal */}
      <Dialog open={!!editingItem} onOpenChange={open => { if (!open) setEditingItem(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <Pencil size={16} className="text-accent" />
              Detalhes do Item
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editingItem?.product?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Ambiente</label>
              <Input
                value={itemForm.environment_label}
                onChange={e => setItemForm(p => ({ ...p, environment_label: e.target.value }))}
                placeholder="Ex: Sala de Jantar, Quarto Master..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Medidas para apresentacao</label>
              <Textarea
                value={itemForm.presentation_dimensions}
                onChange={e => setItemForm(p => ({ ...p, presentation_dimensions: e.target.value }))}
                placeholder="Ex: L 2,20 x P 0,95 x H 0,78 m"
                className="min-h-[72px] text-sm bg-secondary border-border resize-none"
              />
            </div>
            {canManageProjects && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Valor (R$)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={itemForm.price}
                      onChange={e => setItemForm(p => ({ ...p, price: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Valor c/ Desconto</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={itemForm.discount_price}
                      onChange={e => setItemForm(p => ({ ...p, discount_price: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Quantidade</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={itemForm.quantity}
                      onChange={e => setItemForm(p => ({ ...p, quantity: e.target.value }))}
                      placeholder="1"
                    />
                  </div>
                </div>
                {/* Second image selector for presentation */}
                {getSecondaryImageOptions(editingItem?.product).length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">2ª Imagem na Apresentação</label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setItemForm(p => ({ ...p, presentation_image_2_index: '' }))}
                        className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center text-[10px] text-muted-foreground ${
                          itemForm.presentation_image_2_index === '' ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                      >
                        Nenhuma
                      </button>
                      {getSecondaryImageOptions(editingItem?.product).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setItemForm(p => ({ ...p, presentation_image_2_index: option.value }))}
                          className={`relative w-16 h-16 rounded-lg border-2 overflow-hidden ${
                            itemForm.presentation_image_2_index === option.value ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                          }`}
                          title={`${option.source}: ${option.label}`}
                        >
                          <img src={option.url} alt={option.label} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-[8px] text-white">
                            {option.source === 'Ambientada' ? 'Amb.' : 'Prod.'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveItemDetails}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-xs uppercase tracking-[0.1em] font-medium hover:opacity-90 transition-opacity"
              >
                Salvar
              </button>
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
