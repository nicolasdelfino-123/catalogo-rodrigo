export const storeConfig = {
    storeName: " Store Perfumes",

    features: {
        showHeaderContact: true,
        showBrandCarousel: true,
        headerTheme: "black", // "black" | "white"
        footerTheme: "black", // "black" | "white"
    },

    appearance: {
        header: {
            colors: {
                white: "#ffffff",
                black: "#0B0608",
            },
        },
        footer: {
            colors: {
                white: "#ffffff",
                black: "#0b0b0d",
            },
        },
    },

    branding: {
        heroTitle: "Fragancias Árabes Exclusivas",
        heroSubtitle: "Aromas intensos · Calidad premium · Precios accesibles",
        /*       footerText: "Perfumes árabes originales en Argentina.", */
    },

    catalog: {
        // Cambia el texto chico de las cards del listado: "category" muestra la categoría y "brand" muestra la marca del producto.
        productCardMeta: "brand", // "category" | "brand"

        // Categorías visibles del catálogo.
        // El id es el valor real que se guarda/envía a la DB como category_id.
        // El label es el nombre que se muestra en header, footer, filtros, cards y admin.
        // El orden de esta lista define el orden visual en los dropdowns y menús.
        // slug es opcional; si no lo ponés, usa el slug técnico definido en perfumeCategories o lo genera desde el label.
        categories: [
            { id: 1, label: "Masculinos" },
            { id: 2, label: "Femeninos" },
            { id: 3, label: "Unisex" },
        ],
    },

    footer: {
        copyrightName: "Catálogo Web",
        developerName: "Catálogo Web",
        developerWhatsapp: "5493534793366"
    },

    contact: {
        whatsapp: "5493534793366",
        whatsappMessage: "Hola, quiero consultar por un perfume del catálogo",
        whatsappDisplay: "+56 9 6407 7278",

        instagram: "https://www.instagram.com/danna_decants_puq/",
        instagramDisplay: "@danna_decants_puq",

        email: "nicolasdelfino585@gmail.com",
        /*  emailDisplay: "nicolasdelfino585@gmail.com", */
    },

    business: {
        address: "Stand Mall Espacio Urbano Pionero",
        city: "Segundo piso (casi al lado de Tarragona)",
        hours: "Lunes a Sábado 10:30–20:30 - Domingo 11:00–20:00",
    },

    media: {
        // Hero desktop: se carga desde frontend/public. Escribi solo el nombre del archivo o una ruta publica, por ejemplo "f3_si.png".
        heroImageDesktop: "f3_si.png",
        // Hero mobile: se carga desde frontend/public. Escribi solo el nombre del archivo o una ruta publica, por ejemplo "f3_si.png".
        heroImageMobile: "f3_si.png",
        // GIF del GlobalSpinner: se carga desde frontend/public. Si queres cambiarlo, pone el GIF en public y actualiza este nombre.
        globalSpinnerGif: "danna_spinner.gif",
        headerLogo: "logo_attar_prueba.png",
        footerLogo: "logo_danna.jpeg",
    },

    map: {
        embed: "https://www.google.com/maps?q=-53.1315202,-70.9090699&z=17&output=embed",
    }
};
