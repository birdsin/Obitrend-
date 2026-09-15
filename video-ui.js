/* =========================================================
   OBITREND PAYSTACK VIDEO PAYMENT RETURN
   AUTOMATICALLY VERIFIES SUCCESSFUL PAYMENT
   AND REFRESHES VIDEO CREDITS
========================================================= */

async function verifyReturnedVideoPayment(){

  try{

    const params =
      new URLSearchParams(
        window.location.search
      );

    const reference =
      params.get("reference");

    if(!reference){
      return;
    }

    const client =
      window.supabaseClient ||
      window.supabase;

    if(!client?.auth){
      return;
    }

    const {
      data,
      error
    } =
      await client.auth.getSession();

    if(
      error ||
      !data?.session?.access_token
    ){
      return;
    }

    const token =
      data.session.access_token;

    const response =
      await fetch(
        "/api/video-payment",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body:JSON.stringify({
            reference
          })
        }
      );

    const raw =
      await response.text();

    let result = {};

    try{
      result =
        raw
          ? JSON.parse(raw)
          : {};
    }catch{
      result = {};
    }

    if(
      !response.ok ||
      result?.success !== true
    ){
      console.warn(
        "OBITREND video payment verification:",
        result?.error ||
        "Payment verification was not completed."
      );

      return;
    }

    /* -----------------------------------------------------
       PAYMENT VERIFIED AND CREDITED
    ----------------------------------------------------- */

    await loadVideoCredits();

    setStatus(
      result?.alreadyCompleted
        ? "Your video payment was already credited."
        : "Payment successful. Your video credit has been added.",
      "success"
    );

    /* -----------------------------------------------------
       REMOVE PAYSTACK REFERENCE FROM THE ADDRESS BAR
       WITHOUT RELOADING THE APP
    ----------------------------------------------------- */

    try{

      const cleanUrl =
        window.location.origin +
        window.location.pathname;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl
      );

    }catch(_){}

  }catch(error){

    console.warn(
      "OBITREND video payment return:",
      error?.message || error
    );

  }

}
