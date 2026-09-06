// =====================================================
// OBITREND SUPABASE CLIENT
// =====================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://vjlitqujcujwsislprfg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vxKAcrlrdZ3wfNH_n7EuZg_joZKejD6";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  }
);

// Make the client available to the whole OBITREND app.
window.supabase = supabase;
window.supabaseClient = supabase;
window.obitrendSupabase = supabase;

// Tell the rest of the app that Supabase is ready.
window.dispatchEvent(
  new CustomEvent("obitrend:supabase-ready")
);

console.log("OBITREND: Supabase client ready.");


/* =====================================================
   OBITREND DASHBOARD UI FIX
   Keeps the existing authentication, credits,
   Paystack and generation workflow unchanged.
===================================================== */

(() => {

  const installDashboardFixes = () => {

    /* =================================================
       MOBILE IMAGE PREVIEW
    ================================================= */

    const styleId =
      "obitrend-mobile-dashboard-fixes";

    if (!document.getElementById(styleId)) {

      const style =
        document.createElement("style");

      style.id = styleId;

      style.textContent = `

        /* =============================================
           MOBILE UPLOAD PREVIEW
        ============================================= */

        @media (max-width:800px){

          .upload-box{
            min-height:240px !important;
            height:240px !important;
            overflow:hidden !important;
            padding:8px !important;
          }

          .upload-box.has-image{
            min-height:240px !important;
            height:240px !important;
            padding:8px !important;
            display:flex !important;
            align-items:center !important;
            justify-content:center !important;
            overflow:hidden !important;
          }

          #uploadPreview{
            display:block !important;
            width:100% !important;
            height:100% !important;
            max-width:100% !important;
            max-height:224px !important;
            object-fit:contain !important;
            object-position:center !important;
            border-radius:10px !important;
          }

          #uploadEmpty{
            width:100%;
          }

          .create-workspace{
            display:flex !important;
            flex-direction:column !important;
            width:100% !important;
          }

          .controls{
            width:100% !important;
          }

          .generate-main{
            width:100% !important;
            min-height:50px !important;
            height:50px !important;
          }

          .nav-item{
            min-height:46px !important;
            touch-action:manipulation;
          }

          .sidebar.open{
            z-index:120 !important;
          }

          .mobile-overlay.show{
            z-index:110 !important;
          }
        }


        /* =============================================
           SMALL PHONES
        ============================================= */

        @media (max-width:520px){

          .upload-box,
          .upload-box.has-image{
            min-height:230px !important;
            height:230px !important;
          }

          #uploadPreview{
            max-height:214px !important;
          }

          .create-card{
            overflow:visible !important;
          }

          .generate-main{
            width:100% !important;
          }
        }


        /* =============================================
           TOUCH FEEDBACK
        ============================================= */

        .obitrend-clickable{
          -webkit-tap-highlight-color:transparent;
          touch-action:manipulation;
        }

      `;

      document.head.appendChild(style);
    }


    /* =================================================
       ELEMENTS
    ================================================= */

    const imageInput =
      document.getElementById("imageInput");

    const uploadPreview =
      document.getElementById("uploadPreview");

    const uploadEmpty =
      document.getElementById("uploadEmpty");

    const uploadBox =
      document.getElementById("uploadBox");


    /* =================================================
       GUARANTEED MOBILE IMAGE PREVIEW
    ================================================= */

    if (
      imageInput &&
      !imageInput.dataset.obitrendPreviewFix
    ) {

      imageInput.dataset.obitrendPreviewFix = "1";

      imageInput.addEventListener(
        "change",
        () => {

          const file =
            imageInput.files &&
            imageInput.files[0];

          if (!file) return;

          if (
            !file.type ||
            !file.type.startsWith("image/")
          ){
            return;
          }

          const previewUrl =
            URL.createObjectURL(file);


          if (uploadPreview) {

            uploadPreview.onload =
              () => {

                URL.revokeObjectURL(
                  previewUrl
                );

              };

            uploadPreview.src =
              previewUrl;

            uploadPreview.style.display =
              "block";
          }


          if (uploadEmpty) {

            uploadEmpty.style.display =
              "none";
          }


          if (uploadBox) {

            uploadBox.classList.add(
              "has-image"
            );


            /*
             * Put the selected image
             * directly in the user's view.
             */

            setTimeout(
              () => {

                uploadBox.scrollIntoView({
                  behavior:"smooth",
                  block:"center"
                });

              },
              100
            );

          }

        }
      );

    }


    /* =================================================
       SIDEBAR BUTTONS
    ================================================= */

    document
      .querySelectorAll(".nav-item")
      .forEach(button => {

        if (
          button.dataset.obitrendUiFix
        ){
          return;
        }

        button.dataset.obitrendUiFix =
          "1";

        button.classList.add(
          "obitrend-clickable"
        );


        button.addEventListener(
          "click",
          () => {

            const target =
              button.dataset.target;


            /*
             * Existing navigation buttons
             * already have their own handler.
             */
            if(target){
              return;
            }


            const label =
              button.textContent
                .trim();


            /* SETTINGS */

            if(label === "Settings"){

              const profile =
                document.querySelector(
                  ".profile"
                );

              if(profile){

                profile.scrollIntoView({
                  behavior:"smooth",
                  block:"center"
                });

              }

              return;
            }


            /* HELP */

            if(
              label ===
              "Help & Support"
            ){

              const create =
                document.getElementById(
                  "createSection"
                );

              if(create){

                create.scrollIntoView({
                  behavior:"smooth",
                  block:"start"
                });

              }

            }

          }
        );

      });


    /* =================================================
       POPULAR MODEL CARDS
    ================================================= */

    document
      .querySelectorAll(".option")
      .forEach(option => {

        if(
          option.dataset.obitrendUiFix
        ){
          return;
        }

        option.dataset.obitrendUiFix =
          "1";

        option.classList.add(
          "obitrend-clickable"
        );


        option.addEventListener(
          "click",
          () => {

            const name =
              option
                .querySelector(
                  ".option-name"
                )
                ?.textContent
                ?.trim() || "";


            const model =
              document.getElementById(
                "model"
              );


            /*
             * If the card name exists in
             * the real model list, select it.
             */

            if(
              model &&
              name
            ){

              const match =
                Array.from(
                  model.options
                ).find(
                  item =>
                    item.text
                      .trim()
                      .toLowerCase() ===
                    name
                      .toLowerCase()
                );


              if(match){

                model.value =
                  match.value;

                model.dispatchEvent(
                  new Event(
                    "change",
                    {
                      bubbles:true
                    }
                  )
                );

              }

            }


            const create =
              document.getElementById(
                "createSection"
              );


            if(create){

              create.scrollIntoView({
                behavior:"smooth",
                block:"start"
              });

            }

          }
        );

      });


    /* =================================================
       CATEGORY BUTTONS
    ================================================= */

    document
      .querySelectorAll(".category")
      .forEach(button => {

        if(
          button.dataset.obitrendUiFix
        ){
          return;
        }

        button.dataset.obitrendUiFix =
          "1";

        button.classList.add(
          "obitrend-clickable"
        );


        button.addEventListener(
          "click",
          () => {

            const popular =
              document.getElementById(
                "popularSection"
              );


            if(popular){

              popular.scrollIntoView({
                behavior:"smooth",
                block:"start"
              });

            }

          }
        );

      });


    /* =================================================
       VIEW ALL BUTTONS
    ================================================= */

    document
      .querySelectorAll(".view-all")
      .forEach(button => {

        if(
          button.dataset.obitrendUiFix
        ){
          return;
        }

        button.dataset.obitrendUiFix =
          "1";

        button.classList.add(
          "obitrend-clickable"
        );


        button.addEventListener(
          "click",
          () => {

            const section =
              button.closest(
                "#recentSection"
              ) ||
              button.closest(
                "#popularSection"
              );


            if(section){

              section.scrollIntoView({
                behavior:"smooth",
                block:"start"
              });

            }

          }
        );

      });


    /* =================================================
       NOTIFICATION BUTTON
    ================================================= */

    const notification =
      document.querySelector(
        ".notification"
      );


    if(
      notification &&
      !notification.dataset.obitrendUiFix
    ){

      notification.dataset.obitrendUiFix =
        "1";

      notification.classList.add(
        "obitrend-clickable"
      );


      notification.addEventListener(
        "click",
        () => {

          const toast =
            document.getElementById(
              "toast"
            );


          if(toast){

            toast.textContent =
              "You're all caught up.";

            toast.classList.add(
              "show"
            );


            setTimeout(
              () => {

                toast.classList.remove(
                  "show"
                );

              },
              2200
            );

          }

        }
      );

    }


    /* =================================================
       PROFILE BUTTON
    ================================================= */

    const profile =
      document.querySelector(
        ".profile"
      );


    if(
      profile &&
      !profile.dataset.obitrendUiFix
    ){

      profile.dataset.obitrendUiFix =
        "1";

      profile.classList.add(
        "obitrend-clickable"
      );


      profile.addEventListener(
        "click",
        () => {

          const pro =
            document.getElementById(
              "proSection"
            );


          if(pro){

            pro.scrollIntoView({
              behavior:"smooth",
              block:"center"
            });

          }

        }
      );

    }

  };


  /* ===================================================
     INSTALL AFTER DOM IS READY
  =================================================== */

  if(
    document.readyState ===
    "loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      installDashboardFixes,
      {
        once:true
      }
    );

  }else{

    installDashboardFixes();

  }


  /*
   * Second pass guarantees the dashboard
   * controls are present before binding.
   */

  setTimeout(
    installDashboardFixes,
    150
  );

})();


export { supabase };
