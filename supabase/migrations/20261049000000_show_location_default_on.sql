-- "Mostrar no meu perfil" passa a ser uma escolha de verdade (Informações do Perfil). Antes o valor era só um efeito
-- colateral da edição antiga e a tela do perfil nem lia. Quem já tem endereço continua aparecendo como antes.
UPDATE public.profiles SET show_location = true WHERE address IS NOT NULL AND show_location IS DISTINCT FROM true;
