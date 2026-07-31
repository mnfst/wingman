import { createSignal, onCleanup, onMount, type Component } from 'solid-js';
import TitleBar from './components/TitleBar.jsx';
import RequestTabs from './components/RequestTabs.jsx';
import UrlBar from './components/UrlBar.jsx';
import ConfigTabs from './components/ConfigTabs.jsx';
import Conversation from './components/Conversation.jsx';
import ChatComposer from './components/ChatComposer.jsx';
import GistModal from './components/GistModal.jsx';
import AboutModal from './components/AboutModal.jsx';
import StatusBar from './components/StatusBar.jsx';
import { PROVIDERS } from './providers';
import { FORMATS } from './formats';
import { createAppState } from './state/appState';
import { createAppActions } from './state/appActions';

/**
 * Layout, top to bottom, following the conventions developers already know:
 * a Postman-style request strip up top (tabs row, URL bar), then a Bruno-style
 * split: request configuration in the left pane, conversation in the right
 * pane like ChatGPT/Claude. App itself is only wiring. State lives in
 * state/appState, actions in state/appActions.
 */
const App: Component = () => {
  const s = createAppState();
  const a = createAppActions(s);

  const [aboutOpen, setAboutOpen] = createSignal(false);
  // Dev Tools on by default: inspecting the wire is the point of the tool.
  // Turning it off leaves a plain chat transcript.
  const [devTools, setDevTools] = createSignal(true);

  const canSend = () => !s.loading() && s.userMessage().trim().length > 0;

  // ChatGPT-flavoured global shortcuts: ⌘/Ctrl+Enter sends from anywhere,
  // ⌘/Ctrl+Shift+O starts a new request, Shift+Esc refocuses the message box.
  const onGlobalKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter') {
      if (canSend()) {
        e.preventDefault();
        void a.handleSend();
      }
    } else if (mod && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      a.handleNewRequest();
    } else if (e.shiftKey && e.key === 'Escape') {
      e.preventDefault();
      a.focusComposer();
    }
  };
  onMount(() => document.addEventListener('keydown', onGlobalKeyDown));
  onCleanup(() => document.removeEventListener('keydown', onGlobalKeyDown));

  return (
    <div class="app">
      <TitleBar>
        <RequestTabs
          entries={s.history()}
          activeId={s.activeHistoryId()}
          onSelect={a.restoreFromHistory}
          onDelete={a.handleDelete}
          onClear={a.handleClear}
          drafts={s.draftTabs()}
          activeDraftId={s.activeDraftId()}
          onSelectDraft={a.selectDraft}
          onCloseDraft={a.closeDraft}
          onNewRequest={a.handleNewRequest}
        />
      </TitleBar>

      <UrlBar
        formats={FORMATS}
        activeFormatId={s.formatId()}
        onSelectFormat={s.setFormatSafely}
        providers={PROVIDERS}
        activeProviderId={s.provider().id}
        onSelectProvider={s.selectProvider}
        baseUrl={s.baseUrl()}
        onBaseUrlChange={s.handleBaseUrlInput}
        baseUrlPlaceholder={s.format().placeholderBaseUrl ?? 'https://your-manifest.example.com'}
        requestUrl={s.normalized().requestUrl}
        baseUrlNote={s.normalized().note}
        baseUrlProblem={s.normalized().problem}
        apiKey={s.apiKey()}
        apiKeyPlaceholder={s.provider().apiKeyPlaceholder}
        onApiKeyChange={s.persistAndSetKey}
        model={s.model()}
        onModelChange={s.persistAndSetModel}
        modelList={s.modelList()}
        healthStatus={s.healthStatus()}
        loading={s.loading()}
        canSend={canSend()}
        onSend={a.handleSend}
        willRunCode={s.willRunCode()}
        canSave={s.result() !== null && !s.loading()}
        onSaveToGist={a.handleSaveToGist}
        saveStatus={s.saveStatus()}
        onOpenCode={() => s.setConfigTab('client')}
      />

      <div class="main">
        <section class="pane pane--config" aria-label="Request configuration">
          <ConfigTabs
            tab={s.configTab()}
            onTabChange={s.setConfigTab}
            profiles={s.availableProfiles()}
            activeProfileId={s.profile().id}
            onSelectProfile={s.setProfileSafely}
            headers={s.headerEntries()}
            onHeadersChange={s.updateHeaderEntries}
            onResetHeaders={s.resetHeaders}
            blockedHeaders={s.blockedHeaderNames()}
            headersLocked={s.profile().headersLocked ?? false}
            systemPrompt={s.systemPrompts()[s.profile().id] ?? ''}
            onSystemPromptChange={s.updateSystemPrompt}
            sdkCode={s.sdkCode()}
            sdkLang={s.lang()}
            sdkLangOptions={s.profile().langs}
            onSdkLangChange={s.setLang}
            onSdkCodeChange={s.onSdkCodeChange}
            sdkCodeIsEdited={s.sdkCodeIsEdited()}
            onResetSdkCode={s.resetSdkCode}
            sdkExecutable={s.sdkExecutable()}
            stream={s.stream()}
            onStreamChange={s.persistAndSetStream}
          />
        </section>

        <section class="pane pane--chat" aria-label="Conversation">
          <main class="app__thread">
            <Conversation
              userMessage={s.sentMessage()}
              result={s.result()}
              loading={s.loading()}
              hasSent={s.hasSent()}
              format={s.format()}
              streamingText={s.streamingText()}
              devTools={devTools()}
            />
          </main>
          <ChatComposer
            userMessage={s.userMessage()}
            onUserMessageChange={s.setUserMessage}
            loading={s.loading()}
            onSend={a.handleSend}
            willRunCode={s.willRunCode()}
          />
        </section>
      </div>

      <StatusBar
        devTools={devTools()}
        onToggleDevTools={() => setDevTools(!devTools())}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <GistModal
        open={s.gistModalOpen()}
        markdown={s.gistMarkdown()}
        onClose={() => s.setGistModalOpen(false)}
      />
      <AboutModal open={aboutOpen()} onClose={() => setAboutOpen(false)} />
    </div>
  );
};

export default App;
