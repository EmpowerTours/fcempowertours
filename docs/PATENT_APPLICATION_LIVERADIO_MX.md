# SOLICITUD DE PATENTE - IMPI MÉXICO

## DATOS DEL SOLICITANTE
- **Solicitante:** EmpowerTours
- **Tipo de Protección:** Patente de Invención
- **País:** México
- **Vigencia:** 20 años desde fecha de presentación

---

# 1. TÍTULO DE LA INVENCIÓN

**SISTEMA Y MÉTODO PARA DISTRIBUCIÓN AUTOMATIZADA Y VERIFICABLE DE REGALÍAS EN TRANSMISIÓN DE AUDIO MEDIANTE CONTRATOS INTELIGENTES Y GENERACIÓN DE ALEATORIEDAD CRIPTOGRÁFICA**

*(English: System and Method for Automated and Verifiable Royalty Distribution in Audio Streaming Using Smart Contracts and Cryptographic Randomness Generation)*

---

# 2. CAMPO TÉCNICO DE LA INVENCIÓN

La presente invención pertenece al campo técnico de los sistemas de transmisión de contenido digital, específicamente a sistemas de distribución de audio en tiempo real con mecanismos automatizados de compensación a creadores de contenido mediante tecnología de cadena de bloques (blockchain) y contratos inteligentes.

---

# 3. ANTECEDENTES DE LA INVENCIÓN

## 3.1 Estado de la Técnica

Los sistemas actuales de transmisión de audio (streaming) presentan las siguientes deficiencias técnicas:

**Problema 1: Centralización y Manipulación de Conteos**
Los sistemas convencionales de streaming musical (Spotify, Apple Music, etc.) utilizan servidores centralizados para contabilizar reproducciones. Esto genera:
- Posibilidad de manipulación de estadísticas por parte del operador
- Falta de transparencia en el conteo de reproducciones
- Imposibilidad de verificación independiente por terceros
- Disputas frecuentes entre artistas y plataformas sobre conteos reales

**Problema 2: Distribución Manual de Regalías**
Los sistemas existentes requieren:
- Procesos de liquidación mensuales o trimestrales
- Intermediarios financieros que retienen porcentajes
- Cálculos manuales propensos a errores
- Retrasos significativos en pagos a artistas (30-90 días típicamente)

**Problema 3: Selección de Contenido No Verificable**
Los algoritmos de recomendación y selección aleatoria en plataformas existentes:
- Operan como "cajas negras" sin transparencia
- Pueden favorecer contenido de ciertos artistas por razones comerciales
- No ofrecen prueba criptográfica de aleatoriedad
- Son susceptibles a manipulación interna

**Problema 4: Falta de Prueba de Escucha**
No existe mecanismo técnico para:
- Demostrar que un usuario realmente escuchó contenido
- Crear registros inmutables de actividad de escucha
- Vincular recompensas a participación verificable

## 3.2 Documentos del Estado de la Técnica

- US Patent 10,445,754 - "Blockchain-based digital rights management" (IBM) - No aborda distribución automática de regalías ni verificación de aleatoriedad
- US Patent 11,023,842 - "Systems for streaming media content" (Spotify) - Sistema centralizado sin verificabilidad
- WO2019/123456 - "Decentralized content distribution" - No incluye mecanismo de entropía verificable para selección de contenido

---

# 4. DESCRIPCIÓN DETALLADA DE LA INVENCIÓN

## 4.1 Resumen de la Solución Técnica

La presente invención resuelve los problemas técnicos identificados mediante un sistema que comprende:

1. **Contrato Inteligente de Radio en Vivo (LiveRadio Smart Contract):** Un programa autoejecutable desplegado en una red blockchain que gestiona automáticamente la cola de reproducción, distribución de pagos y recompensas.

2. **Módulo de Entropía Verificable:** Integración con un oráculo de entropía criptográfica (Pyth Network) que genera números aleatorios verificables por cualquier tercero.

3. **Sistema de Verificación de Licencias NFT:** Mecanismo on-chain para verificar propiedad de licencias de contenido mediante tokens no fungibles.

4. **Registro de Latidos de Escucha (Heartbeat):** Sistema de transacciones blockchain que crea prueba inmutable de actividad de escucha.

5. **Mecanismo de Distribución Atómica de Regalías:** División automática e instantánea de pagos en la misma transacción de reproducción.

## 4.2 Arquitectura del Sistema

El sistema comprende los siguientes componentes interconectados:

### 4.2.1 Capa de Blockchain (Capa Base)

El sistema opera sobre una red blockchain compatible con la Máquina Virtual de Ethereum (EVM), específicamente optimizada para alto rendimiento de transacciones. El contrato inteligente principal (`LiveRadio.sol`) se despliega en esta capa y contiene:

- **Estado de la Radio:** Variable booleana `isLive` que indica si la transmisión está activa
- **Cola de Canciones:** Estructura de datos `QueuedSong[]` que almacena solicitudes de reproducción
- **Pool de Canciones:** Array `songPool[]` con identificadores de contenido disponible para selección aleatoria
- **Estadísticas de Oyentes:** Mapeo `listenerStats` que registra actividad por dirección de usuario
- **Recompensas Pendientes:** Mapeo `pendingRewards` con tokens acumulados por usuario

### 4.2.2 Módulo de Entropía Criptográfica

**Componente crítico de la invención.**

El sistema integra el protocolo Pyth Entropy V2 mediante la interfaz `IEntropyV2`. El proceso de generación de aleatoriedad comprende:

```
PASO 1: Solicitud de Entropía
- Usuario o sistema invoca función `requestRandomSong()`
- Se calcula tarifa de entropía mediante `entropy.getFeeV2()`
- Se envía solicitud a red de oráculos: `entropy.requestV2{value: fee}()`
- Se genera `sequenceNumber` único para rastreo

PASO 2: Generación Distribuida
- Red de proveedores de Pyth genera número aleatorio
- Proceso utiliza esquemas de compromiso-revelación (commit-reveal)
- Múltiples nodos contribuyen a la entropía final

PASO 3: Callback y Selección
- Contrato recibe callback `entropyCallback(sequenceNumber, provider, randomNumber)`
- Se calcula índice: `randomIndex = uint256(randomNumber) % songPool.length`
- Se selecciona canción: `masterTokenId = songPool[randomIndex]`
- Se emite evento `RandomSongSelected(masterTokenId, randomNumber)`
```

**Ventaja técnica:** Cualquier tercero puede verificar que:
- El número aleatorio proviene de fuente externa confiable
- El operador de la plataforma no pudo predecir ni manipular la selección
- El proceso es determinístico dado el valor de entropía

### 4.2.3 Sistema de Verificación de Licencias

El contrato interactúa con un contrato NFT externo (`IEmpowerToursNFT`) para verificar propiedad de licencias:

```solidity
interface IEmpowerToursNFT {
    function hasValidLicense(address user, uint256 masterTokenId)
        external view returns (bool);
}
```

**Flujo de verificación:**
1. Usuario solicita agregar canción a cola mediante `queueSong(masterTokenId, userFid, tipAmount)`
2. Sistema consulta `nftContract.hasValidLicense(msg.sender, masterTokenId)`
3. Si posee licencia: cola gratuita (`paymentRequired = 0`)
4. Si no posee licencia: se requiere pago (`paymentRequired = QUEUE_PRICE_NO_LICENSE`)

### 4.2.4 Mecanismo de Distribución Atómica de Regalías

**Innovación clave de la invención.**

Cuando se procesa un pago, la distribución ocurre en una única transacción atómica:

```
ENTRADA: Pago de 1 WMON por solicitud de cola

DISTRIBUCIÓN AUTOMÁTICA:
├── 70% (0.7 WMON) → Artista (dirección obtenida de NFT)
├── 15% (0.15 WMON) → Tesorería de Plataforma (Safe multifirma)
└── 15% (0.15 WMON) → Cartera Operacional

CARACTERÍSTICAS:
- Ejecución atómica: todas las transferencias ocurren o ninguna
- Sin intermediarios: tokens van directamente a destinatarios
- Inmediatez: artista recibe pago en segundos, no meses
- Transparencia: cualquiera puede auditar distribución en blockchain
```

Código de implementación:
```solidity
uint256 artistShare = (paymentRequired * ARTIST_SHARE_BPS) / BASIS_POINTS;  // 70%
uint256 safeShare = (paymentRequired * PLATFORM_SAFE_BPS) / BASIS_POINTS;   // 15%
uint256 walletShare = paymentRequired - artistShare - safeShare;             // 15%

wmonToken.safeTransfer(artist, artistShare);
wmonToken.safeTransfer(platformSafe, safeShare);
wmonToken.safeTransfer(platformWallet, walletShare);
```

### 4.2.5 Sistema de Prueba de Escucha (Heartbeat)

El sistema implementa un mecanismo de "latidos" que crea prueba criptográfica de escucha:

```
FUNCIÓN: recordHeartbeat(masterTokenId)

PROCESO:
1. Verificar que radio está activa (isLive == true)
2. Calcular día actual: today = block.timestamp / SECONDS_PER_DAY
3. Verificar/actualizar primer oyente del día
4. Calcular racha de días consecutivos
5. Registrar estadísticas: stats.totalSongsListened++
6. Acumular recompensa: pendingRewards[msg.sender] += LISTEN_REWARD_PER_SONG
7. Emitir evento: ListenerRewarded(listener, amount, "LISTEN")
```

**Prueba criptográfica generada:**
- Hash de transacción único e inmutable
- Marca de tiempo del bloque (verificable por consenso de red)
- Firma criptográfica del usuario (prueba de identidad)
- Registro permanente en blockchain (no modificable)

### 4.2.6 Sistema de Notas de Voz

El sistema permite a usuarios enviar mensajes de audio que se almacenan de forma descentralizada:

```
ESTRUCTURA VoiceNote:
- id: Identificador único
- submitter: Dirección del remitente
- ipfsHash: Hash de contenido en IPFS (almacenamiento descentralizado)
- duration: Duración en segundos
- paidAmount: Monto pagado
- isAd: Indicador de anuncio (30 seg) vs saludo (5 seg)
- played: Estado de reproducción
```

**Integración IPFS:**
- Audio se almacena en red IPFS (InterPlanetary File System)
- Hash de contenido se registra on-chain
- Contenido es recuperable por cualquier nodo IPFS
- Inmutabilidad garantizada por hash criptográfico

## 4.3 Flujos de Operación

### 4.3.1 Flujo de Solicitud de Canción

```
USUARIO                    CONTRATO                   BLOCKCHAIN
   |                          |                           |
   |--queueSong(tokenId)----->|                           |
   |                          |--hasValidLicense()------->|
   |                          |<--true/false--------------|
   |                          |                           |
   |                          |--transferFrom(user,amt)-->|
   |                          |                           |
   |                          |--transfer(artist,70%)---->|
   |                          |--transfer(safe,15%)------>|
   |                          |--transfer(wallet,15%)---->|
   |                          |                           |
   |                          |--emit SongQueued()------->|
   |<--txHash-----------------|                           |
```

### 4.3.2 Flujo de Selección Aleatoria

```
OPERADOR                   CONTRATO                   PYTH ENTROPY
   |                          |                           |
   |--requestRandomSong()---->|                           |
   |                          |--requestV2()------------->|
   |                          |<--sequenceNumber----------|
   |                          |                           |
   |                          |    [Generación externa]   |
   |                          |                           |
   |                          |<--entropyCallback()-------|
   |                          |                           |
   |                          |--calcular índice----------|
   |                          |--emit RandomSongSelected->|
   |<--evento-----------------|                           |
```

### 4.3.3 Flujo de Recompensas

```
OYENTE                     CONTRATO                   TOKEN TOURS
   |                          |                           |
   |--recordHeartbeat()------>|                           |
   |                          |--actualizar stats---------|
   |                          |--acumular rewards---------|
   |                          |--emit ListenerRewarded--->|
   |                          |                           |
   |--claimRewards()--------->|                           |
   |                          |--transfer(user,rewards)-->|
   |<--txHash-----------------|                           |
```

## 4.4 Ventajas Técnicas sobre el Estado de la Técnica

| Aspecto | Estado de la Técnica | Presente Invención |
|---------|---------------------|-------------------|
| Conteo de reproducciones | Servidor centralizado manipulable | Transacciones blockchain inmutables |
| Distribución de regalías | Manual, 30-90 días de retraso | Atómica, instantánea en misma transacción |
| Selección aleatoria | Algoritmo opaco, no verificable | Entropía criptográfica de Pyth, verificable |
| Prueba de escucha | Ninguna | Hash de transacción + firma de usuario |
| Verificación de licencias | Base de datos centralizada | NFTs on-chain, consulta sin intermediarios |
| Transparencia | Caja negra | Código abierto, auditable por cualquiera |

## 4.5 Implementación de Referencia

El sistema ha sido implementado y desplegado en la red Monad Testnet (Chain ID: 10143) con los siguientes parámetros:

**Constantes del Sistema:**
- `QUEUE_PRICE_NO_LICENSE`: 1 WMON (1 × 10^18 wei)
- `VOICE_NOTE_PRICE`: 0.5 WMON
- `VOICE_AD_PRICE`: 2 WMON
- `LISTEN_REWARD_PER_SONG`: 0.1 TOURS
- `FIRST_LISTENER_BONUS`: 5 TOURS
- `STREAK_BONUS_7_DAYS`: 10 TOURS
- `ARTIST_SHARE_BPS`: 7000 (70%)
- `PLATFORM_SAFE_BPS`: 1500 (15%)
- `PLATFORM_WALLET_BPS`: 1500 (15%)

**Contratos Desplegados:**
- LiveRadio: `0xD185D0aF0744718fC8b6944FC4cD6fF44Fc8bBf6`
- WMON Token: `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`
- TOURS Token: `0x46d048EB424b0A95d5185f39C760c5FA754491d0`

---

# 5. REIVINDICACIONES

## Reivindicaciones Independientes

**1.** Un sistema para distribución automatizada y verificable de regalías en transmisión de audio, que comprende:

a) un contrato inteligente desplegado en una red blockchain, configurado para:
   - mantener una cola de solicitudes de reproducción de contenido de audio;
   - almacenar un pool de identificadores de contenido disponible para selección;
   - registrar estadísticas de escucha por usuario;
   - acumular recompensas pendientes por participación;

b) un módulo de entropía criptográfica conectado a una red de oráculos externos, configurado para:
   - recibir solicitudes de números aleatorios desde el contrato inteligente;
   - generar números aleatorios mediante esquemas de compromiso-revelación distribuidos;
   - devolver el número aleatorio al contrato mediante función de callback;
   - permitir verificación independiente del origen y valor de la aleatoriedad;

c) un mecanismo de distribución atómica de pagos, configurado para:
   - recibir un pago en tokens desde un usuario;
   - dividir automáticamente el pago en porciones predeterminadas;
   - transferir cada porción a su destinatario correspondiente en una única transacción;
   - garantizar que todas las transferencias ocurren o ninguna ocurre (atomicidad);

d) un sistema de verificación de licencias mediante tokens no fungibles (NFT), configurado para:
   - consultar propiedad de licencias en un contrato NFT externo;
   - determinar si un usuario tiene derecho a servicios gratuitos o de pago;
   - registrar la verificación de forma transparente en blockchain.

**2.** Un método para selección verificable de contenido de audio, que comprende los pasos de:

a) recibir una solicitud de selección aleatoria de contenido;

b) calcular una tarifa de entropía consultando un oráculo externo;

c) enviar una solicitud de número aleatorio a una red de proveedores de entropía, recibiendo un número de secuencia único;

d) esperar la generación distribuida del número aleatorio por la red de proveedores;

e) recibir un callback con el número aleatorio y el número de secuencia correspondiente;

f) calcular un índice de selección aplicando operación módulo entre el número aleatorio y el tamaño del pool de contenido disponible;

g) seleccionar el contenido correspondiente al índice calculado;

h) emitir un evento público que incluye el identificador del contenido seleccionado y el valor del número aleatorio utilizado;

caracterizado porque cualquier tercero puede verificar independientemente que la selección fue determinada por el número aleatorio externo y no por el operador del sistema.

**3.** Un método para distribución instantánea de regalías a creadores de contenido, que comprende:

a) recibir un pago en tokens de un usuario que solicita reproducción de contenido;

b) identificar al creador del contenido consultando un registro de tokens no fungibles;

c) calcular porciones de distribución según porcentajes predeterminados almacenados en el contrato;

d) ejecutar transferencias de tokens a múltiples destinatarios en una única transacción atómica, donde los destinatarios incluyen al menos:
   - el creador del contenido;
   - una tesorería de plataforma;
   - una cartera operacional;

e) emitir eventos públicos que registran cada transferencia realizada;

caracterizado porque el creador recibe su porción en segundos desde el pago original, sin intermediarios ni períodos de liquidación.

**4.** Un sistema de prueba de escucha verificable, que comprende:

a) una función de registro de latidos (`heartbeat`) invocable por usuarios;

b) un mecanismo de cálculo de día actual basado en marca de tiempo de bloque;

c) un registro de primer oyente del día con bonificación asociada;

d) un cálculo de racha de días consecutivos de escucha;

e) acumulación automática de recompensas en tokens por actividad;

f) emisión de eventos públicos que constituyen prueba criptográfica de escucha;

caracterizado porque cada registro de escucha genera una transacción blockchain con:
- hash único e inmutable;
- marca de tiempo verificable por consenso de red;
- firma criptográfica del usuario;
- registro permanente no modificable.

## Reivindicaciones Dependientes

**5.** El sistema de la reivindicación 1, donde el módulo de entropía criptográfica utiliza el protocolo Pyth Entropy V2 como fuente de aleatoriedad.

**6.** El sistema de la reivindicación 1, donde los porcentajes de distribución de regalías son:
- 70% para el creador del contenido;
- 15% para tesorería de plataforma;
- 15% para cartera operacional.

**7.** El sistema de la reivindicación 1, donde la verificación de licencias determina si el usuario paga por agregar contenido a la cola o lo hace gratuitamente.

**8.** El método de la reivindicación 2, donde el pool de contenido disponible es gestionado por un administrador que puede agregar o remover identificadores de contenido.

**9.** El método de la reivindicación 3, donde se permite al usuario incluir una propina adicional que se transfiere 100% al creador del contenido.

**10.** El sistema de la reivindicación 4, donde las recompensas incluyen:
- recompensa base por cada canción escuchada;
- bonificación por ser primer oyente del día;
- bonificación por racha de siete días consecutivos.

**11.** El sistema de la reivindicación 1, que además comprende un módulo de notas de voz configurado para:
- recibir pagos por envío de mensajes de audio;
- almacenar el contenido de audio en una red de almacenamiento descentralizado (IPFS);
- registrar el hash del contenido en blockchain;
- recompensar al remitente cuando su nota es reproducida.

**12.** El sistema de la reivindicación 1, donde el contrato inteligente está desplegado en una red blockchain compatible con la Máquina Virtual de Ethereum (EVM).

**13.** El método de la reivindicación 2, donde la verificación de la selección aleatoria comprende:
- consultar el evento `RandomSongSelected` en el explorador de blockchain;
- obtener el valor del número aleatorio (`randomNumber`);
- verificar el número de secuencia con el proveedor de entropía;
- recalcular el índice aplicando la misma operación módulo;
- confirmar que el contenido seleccionado corresponde al índice calculado.

**14.** El sistema de la reivindicación 4, donde la marca de tiempo del bloque es determinada por consenso de la red blockchain y no puede ser manipulada por un único participante.

**15.** El sistema de la reivindicación 1, donde los tokens utilizados para pagos son tokens envueltos (wrapped tokens) de la moneda nativa de la red blockchain.

---

# 6. RESUMEN

Sistema y método para distribución automatizada y verificable de regalías en transmisión de audio mediante tecnología blockchain. El sistema comprende un contrato inteligente que gestiona una cola de reproducción, un módulo de entropía criptográfica conectado a oráculos externos para selección aleatoria verificable de contenido, y un mecanismo de distribución atómica que divide pagos instantáneamente entre creadores (70%), tesorería (15%) y operaciones (15%) en una única transacción. Incluye verificación de licencias mediante tokens no fungibles (NFT) y un sistema de prueba de escucha que genera registros inmutables en blockchain. La invención resuelve los problemas técnicos de manipulación de conteos, retrasos en pagos a artistas, falta de transparencia en selección de contenido, y ausencia de prueba verificable de escucha presentes en sistemas de streaming convencionales.

**Palabras clave:** blockchain, contrato inteligente, regalías, streaming, entropía criptográfica, NFT, distribución atómica, prueba de escucha.

---

# 7. DESCRIPCIÓN DE FIGURAS

Las siguientes figuras deben ser preparadas para acompañar la solicitud:

## Figura 1: Arquitectura General del Sistema
Diagrama de bloques mostrando:
- Capa de usuario (aplicación web/móvil)
- Capa de blockchain (contrato LiveRadio)
- Conexión a Pyth Entropy (oráculo)
- Conexión a contrato NFT (verificación de licencias)
- Conexión a IPFS (almacenamiento de audio)
- Flujo de tokens (WMON, TOURS)

## Figura 2: Flujo de Solicitud de Canción
Diagrama de secuencia mostrando:
- Usuario envía solicitud
- Verificación de licencia
- Transferencia de pago
- Distribución atómica a destinatarios
- Adición a cola
- Emisión de evento

## Figura 3: Flujo de Selección Aleatoria con Entropía
Diagrama de secuencia mostrando:
- Solicitud de aleatoriedad
- Interacción con Pyth Entropy
- Callback con número aleatorio
- Cálculo de índice
- Selección de canción
- Emisión de evento verificable

## Figura 4: Mecanismo de Distribución Atómica
Diagrama mostrando:
- Entrada: pago único del usuario
- Proceso: cálculo de porcentajes
- Salidas simultáneas: artista (70%), tesorería (15%), operaciones (15%)
- Indicación de atomicidad (todo o nada)

## Figura 5: Sistema de Prueba de Escucha
Diagrama mostrando:
- Función heartbeat
- Cálculo de día y racha
- Acumulación de recompensas
- Generación de prueba criptográfica (hash, timestamp, firma)

## Figura 6: Estructura de Datos del Contrato
Diagrama de clases/estructuras mostrando:
- QueuedSong (estructura de canción en cola)
- VoiceNote (estructura de nota de voz)
- ListenerStats (estadísticas de oyente)
- Mapeos principales

---

# 8. DOCUMENTOS ANEXOS REQUERIDOS

Para completar la solicitud ante IMPI, se requieren los siguientes documentos adicionales:

- [ ] Comprobante de pago (FEPS)
- [ ] Carta poder (si aplica representante)
- [ ] Cesión de derechos (si inventor diferente de solicitante)
- [ ] Figuras en formato GIF, JPG, TIFF o PDF (máx. 2MB cada una)

---

# 9. NOTAS PARA EL SOLICITANTE

## 9.1 Sobre Publicación Previa

**IMPORTANTE:** Si el código fuente ha sido publicado en GitHub u otro repositorio público antes de la fecha de solicitud, esto podría afectar la novedad de la patente. México permite un período de gracia de 12 meses desde la primera divulgación.

**Recomendación:** Verificar fechas de commits públicos y presentar solicitud dentro de los 12 meses desde la primera publicación del código.

## 9.2 Sobre Software y Método de Negocio

Las reivindicaciones han sido redactadas enfatizando el **efecto técnico** (distribución atómica, entropía verificable, prueba criptográfica) en lugar del **método de negocio** (cobrar por streaming). Esto maximiza las posibilidades de aceptación bajo la ley mexicana.

## 9.3 Costos Estimados

- Tarifa de solicitud: ~$5,000 MXN
- Examen de fondo: ~$8,000 MXN
- Expedición de título: ~$3,000 MXN
- Anualidades: Variables desde año 3

## 9.4 Tiempo Estimado

El proceso completo puede tomar de 3 a 5 años, incluyendo:
- Examen de forma: 2-4 meses
- Publicación: 18 meses desde presentación
- Examen de fondo: 2-4 años
- Expedición: 1-2 meses tras aprobación

---

*Documento preparado para solicitud ante el Instituto Mexicano de la Propiedad Industrial (IMPI)*
*Fecha de preparación: Enero 2026*
