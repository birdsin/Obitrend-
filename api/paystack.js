// =====================================================
// OBITREND PAYSTACK PAYMENT INITIALIZATION
// VERCEL SERVERLESS ENDPOINT
// =====================================================

const PAYSTACK_API =
  'https://api.paystack.co';

const SUPABASE_URL =
  String(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');

const SUPABASE_SERVER_KEY =
  String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

const PAYSTACK_SECRET_KEY =
  String(
    process.env.PAYSTACK_SECRET_KEY ||
    ''
  ).trim();

const PAYSTACK_PLAN_CODE =
  String(
    process.env.PAYSTACK_PRO_PLAN_CODE ||
    ''
  ).trim();

const CALLBACK_URL =
  String(
    process.env.PAYSTACK_CALLBACK_URL ||
    'https://obitrend.vercel.app/'
  ).trim();

const PRO_AMOUNT =
  1500000; // ₦15,000 in kobo

const PRO_CURRENCY =
  'NGN';


// =====================================================
// RESPONSE HELPER
// =====================================================

function send(res, status, data) {

  return res
    .status(status)
    .json(data);

}


// =====================================================
// GET AUTHENTICATED SUPABASE USER
// =====================================================

async function getAuthenticatedUser(
  accessToken
) {

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVER_KEY
  ) {

    throw new Error(
      'Supabase server configuration is missing in Vercel.'
    );

  }

  const response =
    await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: 'GET',

        headers: {
          apikey:
            SUPABASE_SERVER_KEY,

          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json'
        }
      }
    );

  const text =
    await response.text();

  let data = null;

  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data = null;

  }

  if (
    !response.ok ||
    !data?.id
  ) {

    throw new Error(
      data?.msg ||
      data?.message ||
      'Your Supabase login session could not be verified.'
    );

  }

  return data;

}


// =====================================================
// INITIALIZE PAYSTACK TRANSACTION
// =====================================================

async function initializePaystack(
  email,
  userId
) {

  if (!PAYSTACK_SECRET_KEY) {

    throw new Error(
      'PAYSTACK_SECRET_KEY is missing in Vercel.'
    );

  }

  if (!PAYSTACK_PLAN_CODE) {

    throw new Error(
      'PAYSTACK_PRO_PLAN_CODE is missing in Vercel.'
    );

  }

  const payload = {

    email:

      email,

    currency:

      PRO_CURRENCY,

    plan:

      PAYSTACK_PLAN_CODE,

    callback_url:

      CALLBACK_URL,

    metadata: {

      user_id:
        userId,

      email:
        email,

      product:
        'OBITREND PRO',

      plan:
        'weekly',

      amount_naira:
        15000

    }

  };


  const response =
    await fetch(
      `${PAYSTACK_API}/transaction/initialize`,
      {

        method:
          'POST',

        headers: {

          Authorization:
            `Bearer ${PAYSTACK_SECRET_KEY}`,

          'Content-Type':
            'application/json',

          Accept:
            'application/json'

        },

        body:
          JSON.stringify(payload)

      }
    );


  const text =
    await response.text();

  let data = null;

  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    throw new Error(
      'Paystack returned an invalid response.'
    );

  }


  if (
    !response.ok ||
    data?.status !== true
  ) {

    throw new Error(
      data?.message ||
      `Paystack initialization failed (${response.status}).`
    );

  }


  const payment =
    data?.data;


  if (
    !payment?.authorization_url ||
    !payment?.reference
  ) {

    throw new Error(
      'Paystack did not return a valid payment URL and reference.'
    );

  }


  return {

    authorization_url:
      payment.authorization_url,

    access_code:
      payment.access_code || '',

    reference:
      payment.reference

  };

}


// =====================================================
// MAIN VERCEL HANDLER
// =====================================================

export default async function handler(
  req,
  res
) {

  /* ---------------------------------------------------
     ONLY POST IS ALLOWED
  --------------------------------------------------- */

  if (
    req.method !==
    'POST'
  ) {

    return send(
      res,
      405,
      {
        success: false,
        error:
          'Method not allowed.'
      }
    );

  }


  try {

    /* -------------------------------------------------
       REQUIRE SUPABASE ACCESS TOKEN
    ------------------------------------------------- */

    const authorization =
      String(
        req.headers.authorization ||
        ''
      ).trim();


    if (
      !authorization
        .toLowerCase()
        .startsWith('bearer ')
    ) {

      return send(
        res,
        401,
        {
          success: false,
          error:
            'Authentication required. Please sign in again.'
        }
      );

    }


    const accessToken =
      authorization
        .slice(7)
        .trim();


    if (!accessToken) {

      return send(
        res,
        401,
        {
          success: false,
          error:
            'Your login session is missing.'
        }
      );

    }


    /* -------------------------------------------------
       VERIFY REAL SUPABASE USER
    ------------------------------------------------- */

    const user =
      await getAuthenticatedUser(
        accessToken
      );


    const userId =
      String(
        user.id || ''
      ).trim();


    const email =
      String(
        user.email || ''
      )
        .trim()
        .toLowerCase();


    if (
      !userId ||
      !email
    ) {

      return send(
        res,
        400,
        {
          success: false,
          error:
            'Your Supabase account does not have a valid email address.'
        }
      );

    }


    /* -------------------------------------------------
       INITIALIZE PAYSTACK
    ------------------------------------------------- */

    const payment =
      await initializePaystack(
        email,
        userId
      );


    /* -------------------------------------------------
       RETURN PAYMENT DATA TO FRONTEND
    ------------------------------------------------- */

    return send(
      res,
      200,
      {
        success: true,

        authorization_url:
          payment.authorization_url,

        access_code:
          payment.access_code,

        reference:
          payment.reference
      }
    );


  } catch (error) {

    console.error(
      'OBITREND Paystack initialization error:',
      error
    );


    return send(
      res,
      500,
      {
        success: false,

        error:
          error?.message ||
          'A server error occurred while starting payment.'
      }
    );

  }

}
