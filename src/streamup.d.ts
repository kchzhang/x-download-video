declare module '@knoxzhang/streamup' {
  import { DefineComponent } from 'vue';

  export const Stream: DefineComponent<{
    source: string;
    streaming?: boolean;
    smoothSpeed?: number;
    autoScroll?: boolean;
    virtual?: boolean;
  }>;
}
