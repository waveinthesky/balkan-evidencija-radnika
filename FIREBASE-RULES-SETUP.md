# BALKAN – ispravka Firebase odbijenih prijava

## Zašto se pojavljuje “Firebase odbija upis”

Kiosk se autentifikuje kao **Firebase anonimni korisnik**. Koristi `getDocFromServer(badges/KOD)` i potom `setDoc(records/events/items/UUID)`. Ako sigurnosna pravila nemaju ograničenu dozvolu za taj `create` / ponovljeni `update`, **permission-denied** ostavlja sken lokalno na računaru. Povećanje brzine, osvježavanje i ponovno skeniranje to ne rješavaju.

## Šta administrator mora napraviti na Firebase projektu

1. Prijavi se na [Firebase konzolu](https://console.firebase.google.com/project/balkan-evidencijaradnika/firestore/rules) za projekat **balkan-evidencijaradnika**.
2. Otvori **Firestore Database → Rules**. **Prvo napravi kopiju postojećih pravila**, jer postojeća pravila mogu sadržavati dodatne putanje koje naš GitHub projekat ne opisuje.
3. Provjeri da li već postoje pravila za `badges/{barcode}` i `records/{collectionName}/items/{itemId}`. Pravila u `firestore.rules` su predložena potpuna konfiguracija za trenutno poznate putanje aplikacije; ako na Firebase serveru postoje dodatna pravila, potrebno ih je **pažljivo spojiti**, ne naslijepo zamijeniti.
4. Testiraj anoniman `get` za `badges/KOD`, anoniman `create` za `records/events/items/UUID` s važećom karticom i odbijanje `list` za radnike. Testiraj i čitanje cijele evidencije s administratorskim nalogom.
5. Objavi pravila pomoću **Publish**. Izmjena samo GitHub koda **ne objavljuje Firestore pravila**.
6. Ako anonimna prijava na Firebase ne radi, u **Authentication → Sign-in method** provjeri da li je Anonymous provider omogućen. To je zaseban korak od Firestore pravila.
7. Na istom računaru marketa i istom browser profilu otvori kiosk, ne briši keš / lokalne podatke. Klikni **Pošalji čekajuće zapise** i provjeri da broj zapisa pada sa 6 na 0 i da su dolasci vidljivi u administraciji. Ne skeniraj stare prijave ponovo dok lokalni red nije riješen.

## Sigurnost

- Nikada ne koristi `allow read, write: if true` za cijelu Firestore bazu.
- Nisu dopušteni anonimni `list`, `delete` ili admin podaci. Kiosk kreira samo događaj koji odgovara **aktivnoj** kartici na serveru, s izvornim ID-jem i vremenom.
- Ova pravila i dalje zavise od tajnosti fizičkog barkoda i ispravnosti sata kioska. Za najviši nivo zaštite potreban je zaseban server koji ovjerava uređaje i događaje.
- Pravila ne mogu biti potvrđena kao aktivna bez pristupa postavkama korisnikovog Firebase projekta.

## Brza dijagnostika

- `permission-denied` prilikom čitanja `badges/KOD` = kiosk nema dozvolu za `get`.
- `permission-denied` prilikom pisanja `records/events/items/UUID` = kiosk nema dozvolu za `create` ili idempotentni `update`, ili validacija kartice/tijela nije prošla.
- Ako anonimno prijavljivanje nije omogućeno, pojavljuje se greška autentifikacije umjesto greške Firestore upisa.
