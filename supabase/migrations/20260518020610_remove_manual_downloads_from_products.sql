DELETE FROM public.product_downloads
WHERE download_type = 'tech_sheet'
  AND (
    url ~* '(manual|manuais|instru[cç][oõ]es|instrucoes)'
    OR label ~* '(manual|manuais|instru[cç][oõ]es|instrucoes)'
  );

UPDATE public.products
SET tech_sheet = NULL
WHERE tech_sheet ~* '(manual|manuais|instru[cç][oõ]es|instrucoes)';
