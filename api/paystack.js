export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, amount } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email address is required.' });
        }

        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) {
            console.error('PAYSTACK_SECRET_KEY is missing in environment variables.');
            return res.status(500).json({ error: 'Server configuration error: Missing Secret Key.' });
        }

        // Paystack processes amounts in kobo (multiply Naira amount by 100)
        const amountInKobo = (amount || 15000) * 100;

                const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json'
            },
                body: JSON.stringify({
        email: email,
        amount: amountInKobo,
        currency: 'NGN',
        callback_url: `${req.headers.origin || 'https://obitrend-50ewbi53v-birdsins-projects.vercel.app'}`
    })
});
        
        

        const data = await paystackResponse.json();

        if (!paystackResponse.ok || !data.status) {
            console.error('Paystack error response:', data);
            return res.status(400).json({ error: data.message || 'Failed to initialize Paystack transaction.' });
        }

        return res.status(200).json({
            authorization_url: data.data.authorization_url
        });

    } catch (err) {
        console.error('Server exception:', err);
        return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
}
