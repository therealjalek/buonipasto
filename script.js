// Accedi a React e ReactDOM dal global scope (caricati da CDN in index.html)
const { useState, useEffect } = React;
const { render } = ReactDOM;

// Accedi alle funzioni Firebase dal global scope (caricati da CDN in index.html)
const { initializeApp } = firebase;
// In modalità compat, le funzioni di Firestore e Auth si ottengono dalle istanze dei servizi
// Non destrutturiamo qui doc, setDoc, getDoc, deleteDoc direttamente da firebase.firestore
// perché in modalità compat si usano come metodi dell'istanza del database.

// Variabili per la configurazione di Firebase.
// Se esegui questo file al di fuori dell'ambiente Gemini,
// DEVI inserire qui i tuoi valori reali ottenuti dalla console Firebase.
// Altrimenti, la persistenza dei dati NON funzionerà.

// 1. Il tuo ID App Firebase (lo trovi nelle impostazioni del tuo progetto Firebase)
// Esempio: "1:123456789012:web:abcdef1234567890abcdef12"
const __app_id = "1:801958873740:web:50f6a642acaee52a5f89a9"; // <<< INSERISCI IL TUO ID APP QUI

// 2. La configurazione del tuo progetto Firebase (oggetto JSON).
// La trovi nella console Firebase > Impostazioni Progetto > Le tue app > SDK setup and configuration.
// Copia l'intero oggetto JSON e incollalo qui.
const __firebase_config = JSON.stringify({
  apiKey: "AIzaSyBIMlcgR5pfObe_bAdFnZBmr79_p3T1kIU",
  authDomain: "buonipasto-39cac.firebaseapp.com",
  projectId: "buonipasto-39cac",
  storageBucket: "buonipasto-39cac.firebasestorage.app",
  appId: "1:801958873740:web:50f6a642acaee52a5f89a9",
  measurementId: "G-WL7VENZ81K"
}); // <<< INSERISCI LA TUA CONFIGURAZIONE COMPLETA QUI

// 3. Un token di autenticazione personalizzato (generalmente non necessario per questa app semplice)
// Lascia vuoto ("") se non hai un caso d'uso specifico per l'autenticazione personalizzata.
const __initial_auth_token = ""; // Lascia vuoto ("") o inserisci il tuo token se necessario

// Inizializzazione Firebase (variabili globali per lo script)
let appInstance = null;
let dbInstance = null;
let authInstance = null;
let currentUserId = null;
let authReady = false;

// Helper function to create a document reference in compat mode
const getCompatDocRef = (db, appId, userId, collectionPath, docId) => {
    // In modalità compat, si costruisce il percorso della collezione e poi si usa .doc()
    // Esempio: db.collection('artifacts/YOUR_APP_ID/users/YOUR_USER_ID/appData').doc('current')
    const collectionRef = db.collection(`artifacts/${appId}/users/${userId}/${collectionPath}`);
    return collectionRef.doc(docId);
};

// Inizializza Firebase subito all'esecuzione dello script
try {
    const firebaseConfig = JSON.parse(__firebase_config);

    if (Object.keys(firebaseConfig).length === 0) {
        console.warn("Firebase config is empty. Data persistence will not work.");
        authReady = true; // Permetti all'app di caricarsi, ma senza persistenza
    } else {
        appInstance = initializeApp(firebaseConfig);
        dbInstance = firebase.firestore(); // Ottieni l'istanza di Firestore
        authInstance = firebase.auth();   // Ottieni l'istanza di Auth

        // Ora chiama i metodi sull'istanza authInstance
        authInstance.onAuthStateChanged(async (user) => {
            if (user) {
                currentUserId = user.uid;
                console.log("Firebase Auth: Utente autenticato con UID:", currentUserId);
            } else {
                try {
                    if (__initial_auth_token) {
                        await authInstance.signInWithCustomToken(__initial_auth_token);
                        console.log("Firebase Auth: Autenticato con token personalizzato.");
                    } else {
                        await authInstance.signInAnonymously();
                        console.log("Firebase Auth: Autenticato in modo anonimo.");
                    }
                } catch (error) {
                    console.error("Errore durante l'autenticazione Firebase:", error);
                }
                // Fallback per userId se l'autenticazione fallisce o è anonima
                currentUserId = authInstance.currentUser?.uid || crypto.randomUUID();
            }
            authReady = true;
        });
    }
} catch (error) {
    console.error("Errore critico nell'inizializzazione di Firebase:", error);
    authReady = true; // Permetti all'app di caricarsi anche con errore grave
}


// Costante per la soglia minima di spesa per considerare un buono pasto
const MIN_SPEND_THRESHOLD = 8.00;

// Componente principale dell'applicazione
const App = () => {
    // Stati per i dati dell'app
    const [initialTotalValue, setInitialTotalValue] = useState(0);
    const [initialVoucherCount, setInitialVoucherCount] = useState(0);
    const [voucherValue, setVoucherValue] = useState(0);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [remainingVouchers, setRemainingVouchers] = useState(0);
    const [accumulatedScannedPrice, setAccumulatedScannedPrice] = useState(0);
    const [differenceToPay, setDifferenceToPay] = useState(0);

    // Stato per il prezzo "scansionato" (simulato)
    const [scannedPrice, setScannedPrice] = useState('');
    // Stato per i messaggi di errore o successo
    const [message, setMessage] = useState('');

    // Nuovi stati per la lista della spesa
    const [products, setProducts] = useState([]);
    const [newProductText, setNewProductText] = useState('');
    const [showAllProducts, setShowAllProducts] = useState(false);

    // Stati per Firebase (locali al componente, riflettono lo stato globale)
    const [localDb, setLocalDb] = useState(null);
    const [localUserId, setLocalUserId] = useState(null);
    const [localIsAuthReady, setLocalIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [localAppId, setLocalAppId] = useState('');


    // Inizializzazione Firebase e caricamento dati all'avvio
    useEffect(() => {
        // Attendi che Firebase sia inizializzato globalmente
        const checkFirebaseReady = setInterval(() => {
            if (authReady) {
                clearInterval(checkFirebaseReady);
                setLocalDb(dbInstance);
                setLocalUserId(currentUserId);
                setLocalIsAuthReady(authReady);
                setLocalAppId(__app_id);
                setIsLoading(false);
            }
        }, 100); // Controlla ogni 100ms
        return () => clearInterval(checkFirebaseReady);
    }, []);

    // Effetto per caricare i dati all'avvio o quando l'autenticazione è pronta
    useEffect(() => {
        const loadData = async () => {
            if (!localDb || !localUserId || !localIsAuthReady) {
                // Se non pronto o Firebase non configurato, resetta i valori
                console.warn("LoadData: Firebase non pronto o utente non autenticato. Dati non caricati.");
                setInitialVoucherCount(0);
                setVoucherValue(0);
                setRemainingVouchers(0);
                setAccumulatedScannedPrice(0);
                setDifferenceToPay(0);
                setCurrentBalance(0);
                setInitialTotalValue(0);
                setProducts([]); // Resetta anche la lista prodotti
                if (!localDb || !localUserId) {
                    setMessage("Firebase non configurato o autenticazione in corso. I dati non verranno salvati.");
                }
                return;
            }

            setIsLoading(true);
            console.log("LoadData: Tentativo di caricare i dati per l'utente:", localUserId);
            // Usa la funzione helper per ottenere il riferimento al documento
            const docRef = getCompatDocRef(localDb, localAppId, localUserId, "appData", "current");
            try {
                const docSnap = await docRef.get(); // Chiama .get() sul riferimento al documento
                if (docSnap.exists) { // CORREZIONE: accesso come proprietà, non come funzione
                    const data = docSnap.data();
                    setInitialVoucherCount(data.initialVoucherCount || 0);
                    setVoucherValue(data.voucherValue || 0);
                    setRemainingVouchers(data.remainingVouchers || 0);
                    setAccumulatedScannedPrice(data.accumulatedScannedPrice || 0);
                    setDifferenceToPay(data.differenceToPay || 0);
                    setProducts(data.products || []); // Carica la lista prodotti
                    setCurrentBalance((data.remainingVouchers || 0) * (data.voucherValue || 0));
                    setInitialTotalValue((data.initialVoucherCount || 0) * (data.voucherValue || 0));
                    setMessage(`Dati caricati.`);
                    console.log("LoadData: Dati caricati con successo:", data);
                } else {
                    // Nessun dato, resetta a zero
                    setInitialVoucherCount(0);
                    setVoucherValue(0);
                    setRemainingVouchers(0);
                    setAccumulatedScannedPrice(0);
                    setDifferenceToPay(0);
                    setCurrentBalance(0);
                    setInitialTotalValue(0);
                    setProducts([]);
                    setMessage(`Nessun dato trovato.`);
                    console.log("LoadData: Nessun dato trovato per l'utente. Inizializzazione a zero.");
                }
            } catch (e) {
                console.error("LoadData: Errore durante il caricamento dei dati:", e); // Log dell'errore dettagliato
                setMessage(`Errore durante il caricamento dei dati: ${e.message}`); // Mostra l'errore specifico nell'UI
            } finally {
                setIsLoading(false);
                setTimeout(() => setMessage(''), 3000);
            }
        };

        loadData();
    }, [localDb, localUserId, localIsAuthReady, localAppId]);


    // Funzione per salvare i dati su Firestore
    const saveData = async () => {
        if (!localDb || !localUserId || !localIsAuthReady || !localAppId) {
            console.warn("SaveData: Firestore non pronto o utente non autenticato. Impossibile salvare i dati.");
            return;
        }

        console.log("SaveData: Tentativo di salvare i dati per l'utente:", localUserId);
        // Usa la funzione helper per ottenere il riferimento al documento
        const docRef = getCompatDocRef(localDb, localAppId, localUserId, "appData", "current");
        try {
            await docRef.set({ // Chiama .set() sul riferimento al documento
                initialVoucherCount,
                voucherValue,
                remainingVouchers,
                accumulatedScannedPrice,
                differenceToPay,
                products // Salva anche la lista prodotti
            }, { merge: true });
            console.log("SaveData: Dati salvati con successo in Firestore.");
        } catch (e) {
            console.error("SaveData: Errore durante il salvataggio dei dati:", e); // Log dell'errore dettagliato
            setMessage(`Errore durante il salvataggio dei dati: ${e.message}`); // Mostra l'errore specifico nell'UI
        }
    };

    // Effetto per salvare i dati ogni volta che i dati dell'app cambiano
    useEffect(() => {
        if (localIsAuthReady && localDb && localUserId && localAppId) {
            saveData();
        } else {
            console.log("SaveData useEffect: Condizioni per il salvataggio non soddisfatte (Firebase non pronto o utente non autenticato).");
        }
    }, [initialVoucherCount, voucherValue, remainingVouchers, accumulatedScannedPrice, differenceToPay, products, localIsAuthReady, localDb, localUserId, localAppId]);


    // Funzione per impostare i valori iniziali
    const handleSetInitialValues = () => {
        if (initialVoucherCount < 0 || voucherValue < 0) {
            setMessage('Per favor, inserisci valori positivi per buoni e valore.');
            return;
        }
        const total = initialVoucherCount * voucherValue;
        setInitialTotalValue(total);
        setCurrentBalance(total);
        setRemainingVouchers(initialVoucherCount);
        setAccumulatedScannedPrice(0);
        setDifferenceToPay(0);
        setMessage('Valori iniziali impostati con successo!');
        // saveData() chiamato dall'useEffect
        setTimeout(() => setMessage(''), 3000);
    };

    // Funzione per gestire la "scansione" e la sottrazione del prezzo
    const handleScanAndSubtract = () => {
        const price = parseFloat(scannedPrice);
        if (isNaN(price) || price <= 0) {
            setMessage('Per favore, inserisci un prezzo valido e positivo.');
            return;
        }

        const potentialAccumulatedScannedPrice = accumulatedScannedPrice + price;

        let potentialTotalVouchersConsumed = 0;
        if (voucherValue > 0) {
            potentialTotalVouchersConsumed = Math.floor(potentialAccumulatedScannedPrice / voucherValue);
            const remainingAmountFromPotentialAccumulatedPrice = potentialAccumulatedScannedPrice % voucherValue;

            if (remainingAmountFromPotentialAccumulatedPrice > 0 && remainingAmountFromPotentialAccumulatedPrice >= MIN_SPEND_THRESHOLD) {
                potentialTotalVouchersConsumed++;
            }
        }

        if (potentialTotalVouchersConsumed > initialVoucherCount) {
            setMessage('Saldo insufficiente per coprire questa spesa cumulativa con i buoni pasto.');
            return;
        }

        const newRemainingVouchers = initialVoucherCount - potentialTotalVouchersConsumed;
        const newCurrentBalance = newRemainingVouchers * voucherValue;

        const totalCoveredByVouchers = potentialTotalVouchersConsumed * voucherValue;
        const newDifferenceToPay = Math.max(0, potentialAccumulatedScannedPrice - totalCoveredByVouchers);

        setRemainingVouchers(newRemainingVouchers);
        setCurrentBalance(newCurrentBalance);
        setAccumulatedScannedPrice(potentialAccumulatedScannedPrice);
        setDifferenceToPay(newDifferenceToPay);
        setScannedPrice('');
        setMessage(`Sottratto ${price.toFixed(2)}€. Totale speso: ${potentialAccumulatedScannedPrice.toFixed(2)}€. Buoni totali consumati: ${potentialTotalVouchersConsumed}. Nuovo saldo: ${newCurrentBalance.toFixed(2)}€.`);
        // saveData() chiamato dall'useEffect
        setTimeout(() => setMessage(''), 3000);
    };

    // Funzione per aggiungere un prodotto alla lista
    const handleAddProduct = () => {
        if (newProductText.trim() === '') {
            setMessage('Il nome del prodotto non può essere vuoto.');
            return;
        }
        const newProduct = {
            id: Date.now(), // ID unico per il prodotto
            name: newProductText.trim(),
            checked: false
        };
        setProducts(prevProducts => [...prevProducts, newProduct]);
        setNewProductText(''); // Resetta il campo di input
        setMessage('Prodotto aggiunto alla lista.');
        setTimeout(() => setMessage(''), 2000);
    };

    // Funzione per gestire la spunta e cancellare il prodotto
    const handleProductCheck = (id) => {
        setProducts(prevProducts => prevProducts.filter(product => product.id !== id));
        setMessage('Prodotto rimosso dalla lista.');
        setTimeout(() => setMessage(''), 2000);
    };

    // Funzione per resettare tutti i dati dell'app
    const handleResetAllData = async () => {
        if (!localDb || !localUserId || !localAppId) {
            setMessage("Errore: Impossibile resettare i dati. Firebase non pronto.");
            return;
        }

        // Usa la funzione helper per ottenere il riferimento al documento
        const docRef = getCompatDocRef(localDb, localAppId, localUserId, "appData", "current");
        try {
            await docRef.delete(); // Chiama .delete() sul riferimento al documento
            // Resetta tutti gli stati locali
            setInitialVoucherCount(0);
            setVoucherValue(0);
            setRemainingVouchers(0);
            setAccumulatedScannedPrice(0);
            setDifferenceToPay(0);
            setCurrentBalance(0);
            setInitialTotalValue(0);
            setProducts([]); // Resetta anche la lista prodotti
            setMessage(`Tutti i dati sono stati resettati con successo.`);
            console.log("ResetAllData: Tutti i dati sono stati resettati con successo in Firestore.");
        } catch (e) {
            console.error("ResetAllData: Errore durante il reset di tutti i dati:", e); // Log dell'errore dettagliato
            setMessage(`Errore durante il reset di tutti i dati: ${e.message}`); // Mostra l'errore specifico nell'UI
        } finally {
            setTimeout(() => setMessage(''), 3000);
        }
    };


    if (isLoading) {
        return React.createElement(
            "div",
            { className: "min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 font-sans" },
            React.createElement(
                "div",
                { className: "text-xl font-semibold text-gray-700" },
                "Caricamento dati..."
            )
        );
    }

    // Determina quali prodotti mostrare
    const displayedProducts = showAllProducts ? products : products.slice(0, 10);
    const hasMoreProducts = products.length > 10;

    return React.createElement(
        "div",
        { className: "min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 font-sans" },
        React.createElement(
            "div",
            { className: "bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-200" },
            React.createElement(
                "h1",
                { className: "text-3xl font-extrabold text-center text-gray-800 mb-2" },
                "Gestore Buoni Pasto"
            ),
            React.createElement(
                "p",
                { className: "text-sm text-gray-600 text-center mb-6" },
                "\u00A9 Maurizio Rampazzo 2025"
            ),

            localUserId ? React.createElement(
                "p",
                { className: "text-sm text-gray-500 text-center mb-4" },
                "ID Utente: ",
                React.createElement(
                    "span",
                    { className: "font-mono text-gray-700 break-all" },
                    localUserId
                )
            ) : null,

            // Sezione per impostare i valori iniziali
            React.createElement(
                "div",
                { className: "mb-8 p-6 bg-blue-50 rounded-xl shadow-inner" },
                React.createElement(
                    "h2",
                    { className: "text-xl font-semibold text-blue-800 mb-4" },
                    "Imposta Valori Iniziali"
                ),
                React.createElement(
                    "div",
                    { className: "mb-4" },
                    React.createElement(
                        "label",
                        { htmlFor: "voucherCount", className: "block text-sm font-medium text-gray-700 mb-1" },
                        "Numero Totale Buoni:"
                    ),
                    React.createElement("input", {
                        type: "number",
                        id: "voucherCount",
                        value: initialVoucherCount,
                        onChange: (e) => setInitialVoucherCount(parseInt(e.target.value) || 0),
                        className: "w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200",
                        placeholder: "Es: 10",
                        min: "0",
                    })
                ),
                React.createElement(
                    "div",
                    { className: "mb-4" },
                    React.createElement(
                        "label",
                        { htmlFor: "voucherValue", className: "block text-sm font-medium text-gray-700 mb-1" },
                        "Valore Singolo Buono (\u20AC):"
                    ),
                    React.createElement("input", {
                        type: "number",
                        id: "voucherValue",
                        value: voucherValue,
                        onChange: (e) => setVoucherValue(parseFloat(e.target.value) || 0),
                        className: "w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200",
                        placeholder: "Es: 7.00",
                        step: "0.01",
                        min: "0",
                    })
                ),
                React.createElement(
                    "button",
                    {
                        onClick: handleSetInitialValues,
                        className: "w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105",
                    },
                    "Imposta Saldo Iniziale"
                )
            ),

            // Nuova Sezione: Lista Spesa
            React.createElement(
                "div",
                { className: "mb-8 p-6 bg-yellow-50 rounded-xl shadow-inner" },
                React.createElement(
                    "h2",
                    { className: "text-xl font-semibold text-yellow-800 mb-4" },
                    "Lista Spesa"
                ),
                React.createElement(
                    "div",
                    { className: "flex mb-4" },
                    React.createElement("input", {
                        type: "text",
                        value: newProductText,
                        onChange: (e) => setNewProductText(e.target.value),
                        onKeyPress: (e) => { if (e.key === 'Enter') handleAddProduct(); },
                        className: "flex-grow p-3 border border-gray-300 rounded-l-lg focus:ring-yellow-500 focus:border-yellow-500 transition duration-200",
                        placeholder: "Nome prodotto...",
                    }),
                    React.createElement(
                        "button",
                        {
                            onClick: handleAddProduct,
                            className: "bg-yellow-600 text-white py-3 px-4 rounded-r-lg font-semibold shadow-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 transition duration-300 ease-in-out",
                        },
                        "Inserisci Prodotto"
                    )
                ),
                React.createElement(
                    "div",
                    { className: "max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white flex flex-wrap" }, // Added flex flex-wrap
                    displayedProducts.length > 0 ? (
                        displayedProducts.map(product =>
                            React.createElement(
                                "div",
                                { key: product.id, className: "flex items-center w-1/2 py-1 px-2 border-b border-gray-100 last:border-b-0" }, // Adjusted width and padding
                                React.createElement("input", {
                                    type: "checkbox",
                                    checked: product.checked,
                                    onChange: () => handleProductCheck(product.id),
                                    className: "form-checkbox h-4 w-4 text-yellow-600 rounded focus:ring-yellow-500 cursor-pointer mr-2", // Added margin-right
                                }),
                                React.createElement(
                                    "span",
                                    { className: "text-gray-800 text-xs flex-grow" }, // Font piccolo
                                    product.name
                                )
                            )
                        )
                    ) : (
                        React.createElement(
                            "p",
                            { className: "text-gray-500 text-sm text-center py-4 w-full" }, // w-full for centering
                            "Nessun prodotto nella lista."
                        )
                    )
                ),
                hasMoreProducts ? React.createElement(
                    "button",
                    {
                        onClick: () => setShowAllProducts(prev => !prev),
                        className: "w-full bg-yellow-500 text-white py-2 px-4 rounded-lg font-semibold shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105 mt-4",
                    },
                    showAllProducts ? "Comprimi lista" : `Mostra tutti i ${products.length} prodotti`
                ) : null
            ),

            // Sezione per la "Prezzo Articolo"
            React.createElement(
                "div",
                { className: "mb-8 p-6 bg-green-50 rounded-xl shadow-inner" },
                React.createElement(
                    "h2",
                    { className: "text-xl font-semibold text-green-800 mb-4" },
                    "Prezzo Articolo"
                ),
                React.createElement(
                    "div",
                    { className: "mb-4" },
                    React.createElement(
                        "label",
                        { htmlFor: "scannedPrice", className: "block text-sm font-medium text-gray-700 mb-1" },
                        "Prezzo Scansionato (\u20AC):"
                    ),
                    React.createElement("input", {
                        type: "number",
                        id: "scannedPrice",
                        value: scannedPrice,
                        onChange: (e) => setScannedPrice(e.target.value),
                        className: "w-full p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition duration-200",
                        placeholder: "Es: 12.50",
                        step: "0.01",
                        min: "0",
                    })
                ),
                React.createElement(
                    "button",
                    {
                        onClick: handleScanAndSubtract,
                        className: "w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105",
                    },
                    "Sottrai Prezzo"
                )
            ),

            // Sezione per il riepilogo del saldo
            React.createElement(
                "div",
                { className: "p-6 bg-purple-50 rounded-xl shadow-inner text-center" },
                React.createElement(
                    "h2",
                    { className: "text-xl font-semibold text-purple-800 mb-4" },
                    "Riepilogo Buoni Pasto"
                ),
                React.createElement(
                    "p",
                    { className: "text-lg text-gray-700 mb-2" },
                    "Valore Totale Iniziale: ",
                    React.createElement(
                        "span",
                        { className: "font-bold text-purple-900" },
                        initialTotalValue.toFixed(2),
                        "\u20AC"
                    )
                ),
                React.createElement(
                    "p",
                    { className: "text-lg text-gray-700 mb-2" },
                    "Valore Singolo Buono: ",
                    React.createElement(
                        "span",
                        { className: "font-bold text-purple-900" },
                        voucherValue.toFixed(2),
                        "\u20AC"
                    )
                ),
                React.createElement(
                    "p",
                    { className: "text-2xl font-bold text-gray-800 mb-2" },
                    "Saldo Corrente: ",
                    React.createElement(
                        "span",
                        { className: "text-purple-700" },
                        currentBalance.toFixed(2),
                        "\u20AC"
                    )
                ),
                React.createElement(
                    "p",
                    { className: "text-xl font-semibold text-gray-700 mb-2" },
                    "Buoni Rimanenti: ",
                    React.createElement(
                        "span",
                        { className: "text-purple-700" },
                        remainingVouchers
                    )
                ),
                React.createElement(
                    "p",
                    { className: "text-xl font-semibold text-gray-700 mb-2" },
                    "Totale: ",
                    React.createElement(
                        "span",
                        { className: "text-purple-700" },
                        accumulatedScannedPrice.toFixed(2),
                        "\u20AC"
                    )
                ),
                React.createElement(
                    "p",
                    { className: "text-xl font-semibold text-gray-700" },
                    "Differenza da pagare: ",
                    React.createElement(
                        "span",
                        { className: "text-red-600 font-bold" },
                        differenceToPay.toFixed(2),
                        "\u20AC"
                    )
                )
            ),

            // Pulsante Reset Generale
            React.createElement(
                "button",
                {
                    onClick: handleResetAllData,
                    className: "w-full bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold shadow-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105 mt-6",
                },
                "Reset Tutti i Dati"
            ),

            message ? React.createElement(
                "div",
                { className: `mt-6 p-3 rounded-lg text-center ${message.includes('successo') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} font-medium` },
                message
            ) : null
        )
    );
};

// Renderizza l'app React nell'elemento con id "root"
document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.getElementById('root');
    if (rootElement) {
        render(React.createElement(App, null), rootElement);
    }
});